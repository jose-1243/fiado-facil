(async () => {
  const [tab] = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });

  const estado = document.getElementById("estadoWhats");
  estado.textContent = tab ? "Abierta" : "Cerrada";
  estado.className = tab ? "ok" : "off";

  const { cola_whatsapp = [], ultimoResultado } = await chrome.storage.local.get([
    "cola_whatsapp",
    "ultimoResultado"
  ]);

  document.getElementById("cola").textContent = String(cola_whatsapp.length);

  if (ultimoResultado) {
    const fecha = new Date(ultimoResultado.hora);
    document.getElementById("ultimo").textContent =
      ultimoResultado.titulo +
      " — " +
      ultimoResultado.mensaje +
      " (" +
      fecha.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) +
      ")";
  }
})();
