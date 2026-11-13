import { SUMMARY_CHANNEL, validSummaryNonce, validatePendingCounts } from './student-followup.mjs?v=20261113-followup';

const status = document.getElementById('receipt-status');
const close = document.getElementById('receipt-close');
close.addEventListener('click', () => window.close());

function finish(message) {
  status.textContent = message;
  close.hidden = false;
}

function receive() {
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname);
  const nonce = params.get('bridge');
  const data = params.get('counts');
  let rows;
  try { rows = JSON.parse(data); } catch { rows = null; }
  if (!validSummaryNonce(nonce) || !validatePendingCounts(rows)) {
    finish('La respuesta de Google no es válida. Vuelve a consultar los avisos desde Cuaderno.');
    return;
  }
  try {
    const channel = new BroadcastChannel(SUMMARY_CHANNEL);
    const timeout = setTimeout(() => {
      channel.close();
      finish('La pestaña de Cuaderno no recibió el resumen. Déjala abierta y vuelve a consultar los avisos.');
    }, 3500);
    channel.onmessage = ({ data }) => {
      if (data?.type !== 'received' || data.nonce !== nonce) return;
      clearTimeout(timeout);
      channel.close();
      finish('Avisos actualizados. Puedes volver a Cuaderno.');
    };
    channel.postMessage({ type: 'summary', nonce, rows });
  } catch {
    finish('Este navegador no pudo comunicar las pestañas. Vuelve a consultar los avisos desde Cuaderno.');
  }
}

receive();
