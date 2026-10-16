export default {
  // 1. Menangani HTTP Request (Frontend Web & API)
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Endpoint API untuk mengambil pesan email dari database/KV
    if (url.pathname === '/api/messages') {
      const email = url.searchParams.get('email');
      if (!email) {
        return new Response(JSON.stringify({ error: 'Email required' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }

      // Contoh ambil data dari Cloudflare KV (Pastikan KV sudah di-binding dengan nama MY_KV)
      // Jika belum pakai KV, bisa return array kosong dulu
      let messages = [];
      try {
        const stored = await env.MY_KV.get(email, { type: 'json' });
        if (stored) messages = stored;
      } catch (e) {
        // Abaikan jika KV belum diset
      }

      return new Response(JSON.stringify({ messages }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Tampilan Halaman Utama (Frontend HTML)
    const html = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Temp Mail Kilat</title>
          <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
          <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-slate-900 text-white min-h-screen flex flex-col items-center justify-center p-4" x-data="tempMail()">
          <div class="bg-slate-800 p-6 rounded-xl shadow-lg w-full max-w-md border border-slate-700">
              <h1 class="text-xl font-bold mb-4 text-center text-cyan-400">Temporary Email</h1>
              <div class="flex items-center gap-2 mb-6">
                  <input type="text" readonly x-model="email" class="bg-slate-900 border border-slate-700 p-2 rounded w-full text-center font-mono text-sm text-cyan-300">
                  <button @click="generateEmail" class="bg-cyan-600 px-4 py-2 rounded hover:bg-cyan-500 text-sm font-semibold transition">Ganti</button>
              </div>
              
              <h2 class="font-semibold mb-2 text-sm text-slate-300">Inbox Masuk:</h2>
              <div class="bg-slate-900 border border-slate-700 rounded p-4 h-64 overflow-y-auto space-y-3">
                  <template x-for="msg in messages">
                      <div class="border-b border-slate-800 pb-2 text-sm">
                          <p class="text-xs text-slate-400">Dari: <span x-text="msg.sender"></span></p>
                          <p class="font-bold text-cyan-200" x-text="msg.subject"></p>
                          <p class="text-xs text-slate-300 mt-1 whitespace-pre-line" x-text="msg.body"></p>
                      </div>
                  </template>
                  <p x-show="messages.length === 0" class="text-slate-500 text-center text-xs mt-20">Belum ada email masuk...</p>
              </div>
          </div>

          <script>
              function tempMail() {
                  return {
                      email: '',
                      messages: [],
                      init() {
                          this.generateEmail();
                          setInterval(() => this.fetchMessages(), 5000);
                      },
                      generateEmail() {
                          const randomStr = Math.random().toString(36).substring(2, 10);
                          // Ganti domainanda.com dengan domain Anda sendiri yang sudah diset di Cloudflare
                          this.email = randomStr + '@domainanda.com';
                          this.messages = [];
                      },
                      async fetchMessages() {
                          if (!this.email) return;
                          try {
                              const res = await fetch('/api/messages?email=' + this.email);
                              const data = await res.json();
                              if (data.messages) this.messages = data.messages;
                          } catch (e) {
                              console.error(e);
                          }
                      }
                  }
              }
          </script>
      </body>
      </html>
    `;

    return new Response(html, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  },

  // 2. Menangani Email Masuk dari Cloudflare Email Routing
  async email(message, env, ctx) {
    const recipient = (message.to || '').toLowerCase();
    const sender = message.from;
    const subject = message.headers.get('subject') || 'Tanpa Subjek';

    let body = 'Isi email diterima.';
    try {
      const textStream = new Response(message.raw).text();
      let rawText = await textStream;
      
      // Bersihkan teks mentah email untuk mencari bagian isi pesan (biasanya di bawah setelah header)
      // Kita ambil teks setelah baris kosong ganda atau potong bagian header teknis
      let cleanBody = rawText;
      const headerEndIndex = rawText.indexOf('\r\n\r\n');
      if (headerEndIndex !== -1) {
        cleanBody = rawText.slice(headerEndIndex).trim();
      }
      
      // Batasi maksimal 400 karakter agar rapi di web
      body = cleanBody.replace(/[^\x20-\x7E\n\r]/g, '').slice(0, 400) || rawText.slice(0, 300);
    } catch (e) {
      body = 'Gagal membaca isi email.';
    }

    if (env.MY_KV && recipient) {
      const emailName = recipient.split('@')[0];
      let existing = await env.MY_KV.get(emailName, { type: 'json' }) || [];
      existing.unshift({ sender, subject, body, time: new Date().toISOString() });
      await env.MY_KV.put(emailName, JSON.stringify(existing), { expirationTtl: 3600 });
    }
  }
};
