if (!window.__fiadoAuto) {
  window.__fiadoAuto = true;

  chrome.runtime.onMessage.addListener((mensaje, _emisor, responder) => {
    if (mensaje?.accion === "procesar_cola") {
      procesarCola();
      responder({ ok: true });
    }
  });

  procesarCola();
}

async function procesarCola() {
  if (window.__fiadoEnviando) return;
  window.__fiadoEnviando = true;

  try {
    for (;;) {
      const { cola_whatsapp = [] } = await chrome.storage.local.get("cola_whatsapp");
      const pendiente = cola_whatsapp[0];
      if (!pendiente) break;

      if (enPantallaQr()) {
        avisar(
          "Conecta WhatsApp Web",
          "Escanea el código QR una vez y los avisos se enviarán automáticamente."
        );
        break;
      }

      const enElChatCorrecto =
        location.pathname.startsWith("/send") &&
        new URLSearchParams(location.search).get("phone") === pendiente.phone;

      if (!enElChatCorrecto) {
        location.href =
          "https://web.whatsapp.com/send?phone=" +
          pendiente.phone +
          "&text=" +
          encodeURIComponent(pendiente.text) +
          "&app_absent=0";
        break;
      }

      try {
        await enviarEnChatAbierto(pendiente.text);
        avisar("Mensaje enviado", "Se avisó por WhatsApp a " + pendiente.phone);
      } catch (error) {
        avisar("No se pudo enviar", error.message || "Error desconocido.");
      }

      cola_whatsapp.shift();
      await chrome.storage.local.set({ cola_whatsapp });
      await dormir(1200);
    }
  } finally {
    window.__fiadoEnviando = false;
  }
}

async function enviarEnChatAbierto(texto) {
  const composer = await esperar(() => buscarComposer(), 90000);

  if ((composer.textContent || "").trim() !== texto.trim()) {
    composer.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, texto);
  }

  const boton = await esperar(() => botonEnviar(), 15000);
  boton.click();
  await dormir(800);
}

function buscarComposer() {
  const clicarContinuar = botonDeTexto(/^continuar$/i);
  if (clicarContinuar) {
    clicarContinuar.click();
    return null;
  }
  return document.querySelector('footer [contenteditable="true"]');
}

function botonEnviar() {
  const icono = document.querySelector('footer [data-icon="send"]');
  return icono ? icono.closest("button") : null;
}

function botonDeTexto(expresion) {
  for (const span of document.querySelectorAll("span")) {
    if (expresion.test((span.textContent || "").trim())) {
      const boton = span.closest("button");
      if (boton) return boton;
    }
  }
  return null;
}

function hayDialogoNumeroInvalido() {
  const dialogo = document.querySelector('span[data-animate-modal-popup="true"]');
  return !!dialogo && /no es v.lido|not valid/i.test(dialogo.textContent || "");
}

function enPantallaQr() {
  return !!document.querySelector("canvas[data-ref]");
}

function esperar(obtener, timeout) {
  return new Promise((resolver, rechazar) => {
    const inicio = Date.now();

    (function revisar() {
      if (hayDialogoNumeroInvalido()) {
        rechazar(new Error("Ese número no está registrado en WhatsApp."));
        return;
      }

      const elemento = obtener();
      if (elemento) {
        resolver(elemento);
        return;
      }

      if (Date.now() - inicio > timeout) {
        rechazar(new Error("Tiempo agotado esperando el chat de WhatsApp."));
        return;
      }

      setTimeout(revisar, 250);
    })();
  });
}

function dormir(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

function avisar(titulo, mensaje) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.png",
      title: titulo,
      message: mensaje
    });
  } catch {
    /* notificaciones pueden fallar en algunos contextos */
  }

  chrome.storage.local.set({
    ultimoResultado: { titulo, mensaje, hora: Date.now() }
  });
}
