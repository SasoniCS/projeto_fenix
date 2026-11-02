/* =========================================================
   SERVICE WORKER
   Um script que roda "por trás" da página e fica entre o app e a
   internet. Aqui ele guarda os arquivos do app no celular, para que
   ele abra mesmo sem conexão.
   ========================================================= */

/* Nome (e versão) do "armário" onde os arquivos ficam guardados.
   IMPORTANTE: sempre que você mudar qualquer arquivo do app,
   troque a versão (fenix-v2, fenix-v3...). É assim que os aparelhos
   percebem que existe uma versão nova. */
const CACHE = 'fenix-v2';

/* Arquivos que serão guardados (o "esqueleto" do app) */
const ARQUIVOS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

/* 1) INSTALAÇÃO: acontece na primeira vez (ou quando o arquivo muda).
   Abrimos o armário e guardamos todos os arquivos da lista. */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)));
  self.skipWaiting();   // não espera a versão antiga fechar para assumir
});

/* 2) ATIVAÇÃO: limpeza. Apaga armários de versões antigas. */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(nomes =>
      Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();  // passa a controlar as páginas já abertas
});

/* 3) BUSCA: toda vez que a página pede um arquivo, passa por aqui.
   Estratégia "cache primeiro": se o arquivo está no armário, entrega
   na hora (rápido e funciona offline); se não está, busca na internet. */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;                       // só trata leituras
  if (new URL(e.request.url).origin !== location.origin) return; // ignora sites externos (ex.: Google Fonts)

  e.respondWith(
    caches.match(e.request).then(guardado => guardado || fetch(e.request))
  );
});
