chrome.runtime.onMessage.addListener((mensaje, _emisor, responder) => {
  if (mensaje?.accion === "ping") {
    responder({ ok: true, nombre: "Fiado Fácil Auto" });
    return;
  }

  if (mensaje?.accion === "enviar_whatsapp") {
    encaminar(mensaje)
      .then(responder)
      .catch((error) => responder({ ok: false, error: error.message }));
    return true;
  }
});

async function encaminar({ telefono, texto }) {
  const { cola_whatsapp = [] } = await chrome.storage.local.get("cola_whatsapp");
  cola_whatsapp.push({ phone: telefono, text: texto, hora: Date.now() });
  await chrome.storage.local.set({ cola_whatsapp });

  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });

  if (tab?.id) {
    const avisoEnviado = await avisarContenido(tab.id).catch(() => false);

    if (!avisoEnviado) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
        });
        await avisarContenido(tab.id).catch(() => {});
      } catch {
        /* la pestaña puede estar cargando; al terminar el content script tomará la cola */
      }
    }
  } else {
    await chrome.tabs.create({ url: "https://web.whatsapp.com/" });
  }

  return { ok: true };
}

function avisarContenido(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { accion: "procesar_cola" }, (respuesta) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(respuesta || { ok: true });
    });
  });
}
