
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://bqfresrrpyluovlxykvs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rctQ2Bt-cdtiJtwjxsng1g_TohOmwOO";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let usuarioActual = null;
let perfilActual = null;
let clientes = [];
let clienteSeleccionado = null;
let movimientosActuales = [];
let saldosPorCliente = new Map();
let toastTimeout = null;

const $ = (id) => document.getElementById(id);

function mostrar(elemento, visible = true) {
  if (elemento) elemento.classList.toggle("hidden", !visible);
}

function texto(elemento, valor) {
  if (elemento) elemento.textContent = valor ?? "";
}

function limpiarMensaje(id) {
  const elemento = $(id);
  if (!elemento) return;
  elemento.textContent = "";
  elemento.className = "form-message";
}

function mensaje(id, contenido, tipo = "") {
  const elemento = $(id);
  if (!elemento) return;
  elemento.textContent = contenido;
  elemento.className = "form-message";
  if (tipo) elemento.classList.add(tipo);
}

function dinero(valor) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(Number(valor || 0));
}

function hoyISO() {
  const ahora = new Date();
  return new Date(
    ahora.getTime() - ahora.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 10);
}

function fechaLegible(valor) {
  if (!valor) return "Sin fecha";
  const fecha = new Date(`${valor}T00:00:00`);
  if (Number.isNaN(fecha.getTime())) return String(valor);

  return fecha.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function iniciales(nombre) {
  const partes = String(nombre || "C").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "C";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();

  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function escaparHTML(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[caracter]);
}

function normalizarTelefono(telefono) {
  let limpio = String(telefono || "").trim().replace(/[^\d+]/g, "");
  if (/^3\d{9}$/.test(limpio)) return `+57${limpio}`;
  if (/^57\d{10}$/.test(limpio)) return `+${limpio}`;
  return limpio;
}

function validarTelefono(telefono) {
  return /^\+[1-9]\d{7,14}$/.test(telefono);
}

function mostrarToast(contenido, tipo = "") {
  const elemento = $("toast");
  if (!elemento) return;

  elemento.textContent = contenido;
  elemento.className = "toast";
  if (tipo) elemento.classList.add(tipo);
  mostrar(elemento, true);

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => mostrar(elemento, false), 3500);
}

function bloquearFormulario(formulario, bloquear) {
  if (!formulario) return;
  formulario.classList.toggle("loading", bloquear);

  formulario.querySelectorAll("button, input").forEach((control) => {
    control.disabled = bloquear;
  });
}

function errorSupabase(error) {
  if (!error) return "Ocurrió un error inesperado.";

  const detalle = String(error.message || "").toLowerCase();

  if (
    detalle.includes("invalid login credentials") ||
    detalle.includes("invalid credentials")
  ) {
    return "Correo o contraseña incorrectos.";
  }

  if (detalle.includes("user already registered")) {
    return "Ese correo ya tiene una cuenta. Intenta iniciar sesión.";
  }

  if (detalle.includes("email not confirmed")) {
    return "Confirma tu correo electrónico antes de iniciar sesión.";
  }

  if (detalle.includes("email provider")) {
    return "La autenticación por correo debe estar habilitada en Supabase.";
  }

  if (
    detalle.includes("row-level security") ||
    detalle.includes("permission denied")
  ) {
    return "Supabase bloqueó la operación por permisos. Revisa las políticas RLS.";
  }

  if (detalle.includes("registrar_abono_cliente")) {
    return "No está instalada la función SQL para registrar abonos.";
  }

  return error.message || "No se pudo completar la operación.";
}

function saldoDeCliente(clienteId) {
  return Number(saldosPorCliente.get(clienteId) || 0);
}

/* VISTAS */

function verLogin() {
  mostrar($("vistaLogin"), true);
  mostrar($("vistaRegistro"), false);
  limpiarMensaje("mensajeAuth");
  limpiarMensaje("mensajeRegistro");
}

function verRegistro() {
  mostrar($("vistaLogin"), false);
  mostrar($("vistaRegistro"), true);
  limpiarMensaje("mensajeAuth");
  limpiarMensaje("mensajeRegistro");
}

function verAplicacion() {
  mostrar($("authSection"), false);
  mostrar($("appMain"), true);
}

function verAutenticacion() {
  mostrar($("authSection"), true);
  mostrar($("appMain"), false);
  mostrar($("seccionFiados"), false);
  mostrar($("customers-section"), true);
  verLogin();
}

/* PERFIL DEL USUARIO */

async function cargarPerfil() {
  if (!usuarioActual) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .eq("id", usuarioActual.id)
    .maybeSingle();

  if (error) console.warn("Error consultando perfil:", error.message);

  perfilActual = data || {
    id: usuarioActual.id,
    full_name:
      usuarioActual.user_metadata?.full_name ||
      usuarioActual.user_metadata?.name ||
      "Tendero",
    phone: usuarioActual.user_metadata?.phone || ""
  };

  texto(
    $("saludoTendero"),
    `Hola, ${(perfilActual.full_name || "Tendero").split(" ")[0]} 👋`
  );

  return perfilActual;
}

async function guardarPerfil(nombre, telefono) {
  if (!usuarioActual) return;

  const datos = {
    id: usuarioActual.id,
    full_name: nombre.trim(),
    phone: telefono
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(datos, { onConflict: "id" });

  if (error) {
    console.error("No se pudo guardar el perfil:", error);
  }

  perfilActual = datos;
  texto($("saludoTendero"), `Hola, ${nombre.split(" ")[0]} 👋`);
}

/* REGISTRO POR CORREO */

async function registrarCuenta(evento) {
  evento.preventDefault();

  const formulario = $("formRegistro");
  limpiarMensaje("mensajeRegistro");

  const nombre = $("nombreCompleto").value.trim();
  const telefono = normalizarTelefono($("telefonoPropietario").value);
  const email = $("emailRegistro").value.trim().toLowerCase();
  const password = $("registroPassword").value;
  const confirmar = $("confirmarPassword").value;

  if (nombre.length < 2) {
    mensaje("mensajeRegistro", "Escribe tu nombre completo.", "error");
    return;
  }

  if (!validarTelefono(telefono)) {
    mensaje(
      "mensajeRegistro",
      "Escribe un celular válido. En Colombia puedes usar 3001234567.",
      "error"
    );
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    mensaje("mensajeRegistro", "Escribe un correo electrónico válido.", "error");
    return;
  }

  if (password.length < 6) {
    mensaje(
      "mensajeRegistro",
      "La contraseña debe tener al menos 6 caracteres.",
      "error"
    );
    return;
  }

  if (password !== confirmar) {
    mensaje("mensajeRegistro", "Las contraseñas no coinciden.", "error");
    return;
  }

  bloquearFormulario(formulario, true);

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: nombre,
          phone: telefono
        }
      }
    });

    if (error) throw error;

    if (data.session && data.user) {
      usuarioActual = data.user;
      await guardarPerfil(nombre, telefono);
      mensaje(
        "mensajeRegistro",
        "¡Cuenta creada! Entrando a Fiado Fácil...",
        "success"
      );
      await iniciarAplicacion(data.user);
      return;
    }

    $("emailLogin").value = email;
    verLogin();
    mensaje(
      "mensajeAuth",
      "Cuenta registrada. Revisa tu correo, confirma la cuenta e inicia sesión.",
      "success"
    );
  } catch (error) {
    console.error("Error de registro:", error);
    mensaje("mensajeRegistro", errorSupabase(error), "error");
  } finally {
    bloquearFormulario(formulario, false);
  }
}

/* INICIO DE SESIÓN POR CORREO */

async function iniciarSesion(evento) {
  evento.preventDefault();
  limpiarMensaje("mensajeAuth");

  const formulario = $("formLogin");
  const email = $("emailLogin").value.trim().toLowerCase();
  const password = $("password").value;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    mensaje("mensajeAuth", "Escribe un correo electrónico válido.", "error");
    return;
  }

  bloquearFormulario(formulario, true);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    if (!data.user) throw new Error("Supabase no devolvió el usuario.");

    await iniciarAplicacion(data.user);
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    mensaje("mensajeAuth", errorSupabase(error), "error");
  } finally {
    bloquearFormulario(formulario, false);
  }
}

async function iniciarAplicacion(usuario) {
  usuarioActual = usuario;
  verAplicacion();
  cerrarCuentaCliente(false);

  try {
    await cargarPerfil();
    await cargarClientes();
  } catch (error) {
    console.error("Error cargando la aplicación:", error);
    mostrarToast(errorSupabase(error), "error");
  }
}

async function cerrarSesion() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    usuarioActual = null;
    perfilActual = null;
    clientes = [];
    clienteSeleccionado = null;
    movimientosActuales = [];
    saldosPorCliente.clear();

    verAutenticacion();
    $("formLogin").reset();
    $("formRegistro").reset();

    mostrarToast("Sesión cerrada.");
  } catch (error) {
    console.error("Error cerrando sesión:", error);
    mostrarToast(errorSupabase(error), "error");
  }
}

/* CLIENTES Y RESUMEN */

async function cargarClientes() {
  if (!usuarioActual) return;

  texto($("estadoClientes"), "Cargando clientes...");
  limpiarMensaje("mensajeClientes");

  const { data, error } = await supabase
    .from("customers")
    .select("id, owner_id, name, phone, created_at")
    .eq("owner_id", usuarioActual.id)
    .order("name", { ascending: true });

  if (error) throw error;

  clientes = data || [];
  await recalcularSaldos();
  pintarClientes();
  actualizarResumen();
}

async function recalcularSaldos() {
  saldosPorCliente = new Map();

  for (const cliente of clientes) {
    saldosPorCliente.set(cliente.id, 0);
  }

  if (!usuarioActual || clientes.length === 0) return;

  const idsClientes = clientes.map((cliente) => cliente.id);

  const { data: fiados, error: errorFiados } = await supabase
    .from("fiados")
    .select("id, customer_id, valor")
    .eq("owner_id", usuarioActual.id)
    .in("customer_id", idsClientes);

  if (errorFiados) throw errorFiados;

  const listaFiados = fiados || [];
  const idsFiados = listaFiados.map((fiado) => fiado.id);
  let abonos = [];

  if (idsFiados.length) {
    const { data, error } = await supabase
      .from("abonos")
      .select("fiado_id, valor")
      .eq("owner_id", usuarioActual.id)
      .in("fiado_id", idsFiados);

    if (error) throw error;
    abonos = data || [];
  }

  const abonadoPorFiado = new Map();

  for (const abono of abonos) {
    abonadoPorFiado.set(
      abono.fiado_id,
      (abonadoPorFiado.get(abono.fiado_id) || 0) + Number(abono.valor || 0)
    );
  }

  for (const fiado of listaFiados) {
    const pendiente = Math.max(
      0,
      Number(fiado.valor || 0) - (abonadoPorFiado.get(fiado.id) || 0)
    );

    saldosPorCliente.set(
      fiado.customer_id,
      (saldosPorCliente.get(fiado.customer_id) || 0) + pendiente
    );
  }
}

function actualizarResumen() {
  const total = [...saldosPorCliente.values()].reduce(
    (suma, valor) => suma + Number(valor || 0),
    0
  );

  texto($("totalDeuda"), dinero(total));
  texto($("totalClientes"), String(clientes.length));
}

function pintarClientes() {
  const lista = $("listaClientes");
  if (!lista) return;

  const busqueda = $("buscarCliente").value.trim().toLowerCase();
  lista.innerHTML = "";

  const filtrados = clientes.filter((cliente) =>
    String(cliente.name || "").toLowerCase().includes(busqueda) ||
    String(cliente.phone || "").toLowerCase().includes(busqueda)
  );

  texto(
    $("estadoClientes"),
    clientes.length
      ? `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} registrado${clientes.length === 1 ? "" : "s"}`
      : ""
  );

  mostrar($("estadoVacio"), clientes.length === 0);
  mostrar(lista, clientes.length > 0);

  if (!clientes.length) return;

  if (!filtrados.length) {
    lista.innerHTML = `<p class="muted small">No encontramos clientes con esa búsqueda.</p>`;
    return;
  }

  for (const cliente of filtrados) {
    const fila = document.createElement("div");
    fila.className = "customer-item";

    fila.innerHTML = `
      <button type="button" class="customer-main"
        data-accion="abrir" data-id="${escaparHTML(cliente.id)}"
        style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;text-align:left;background:transparent;border:0;padding:0;color:inherit">
        <span class="customer-avatar">${escaparHTML(iniciales(cliente.name))}</span>
        <span class="customer-info">
          <strong>${escaparHTML(cliente.name)}</strong>
          <span class="muted small">${escaparHTML(cliente.phone || "Sin celular")}</span>
        </span>
      </button>
      <div class="customer-balance">
        <strong>${escaparHTML(dinero(saldoDeCliente(cliente.id)))}</strong>
      </div>
      <button type="button" class="btn btn-secondary"
        data-accion="fiado" data-id="${escaparHTML(cliente.id)}"
        aria-label="Registrar fiado">+</button>
    `;

    lista.appendChild(fila);
  }
}

async function guardarCliente(evento) {
  evento.preventDefault();
  if (!usuarioActual) return;

  const formulario = $("formularioCliente");
  limpiarMensaje("mensajeClientes");

  const nombre = $("nombre").value.trim();
  const telefono = $("telefono").value.trim();

  if (nombre.length < 2) {
    mensaje("mensajeClientes", "Escribe un nombre de al menos 2 caracteres.", "error");
    return;
  }

  bloquearFormulario(formulario, true);

  try {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        owner_id: usuarioActual.id,
        name: nombre,
        phone: telefono || null
      })
      .select("id, owner_id, name, phone, created_at")
      .single();

    if (error) throw error;

    clientes.push(data);
    saldosPorCliente.set(data.id, 0);
    formulario.reset();
    mostrar(formulario, false);
    pintarClientes();
    actualizarResumen();
    mostrarToast("Cliente agregado correctamente.");
  } catch (error) {
    console.error("Error guardando cliente:", error);
    mensaje("mensajeClientes", errorSupabase(error), "error");
  } finally {
    bloquearFormulario(formulario, false);
  }
}

/* CUENTA E HISTORIAL DEL CLIENTE */

async function abrirCuentaCliente(clienteId, abrirFormularioFiado = false) {
  const cliente = clientes.find((item) => item.id === clienteId);
  if (!cliente) {
    mostrarToast("No encontramos ese cliente.", "error");
    return;
  }

  clienteSeleccionado = cliente;

  mostrar($("customers-section"), false);
  mostrar($("seccionFiados"), true);

  texto($("nombreClienteFiados"), cliente.name);
  texto($("telefonoClienteFiados"), cliente.phone || "Sin celular");
  texto($("avatarCliente"), iniciales(cliente.name));

  cerrarFormulariosMovimiento();
  await cargarMovimientosCliente();

  if (abrirFormularioFiado) {
    mostrar($("formularioFiado"), true);
    $("valorFiado").focus();
  }

  $("seccionFiados").scrollIntoView({ behavior: "smooth", block: "start" });
}

function cerrarCuentaCliente(volverLista = true) {
  clienteSeleccionado = null;
  movimientosActuales = [];
  mostrar($("seccionFiados"), false);

  if (volverLista) {
    mostrar($("customers-section"), true);
    $("customers-section").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function cargarMovimientosCliente() {
  if (!usuarioActual || !clienteSeleccionado) return;

  limpiarMensaje("mensajeMovimientos");
  texto($("saldoCliente"), "Cargando...");
  texto($("cantidadFiados"), "Calculando saldo...");

  const clienteId = clienteSeleccionado.id;

  const { data: fiados, error: errorFiados } = await supabase
    .from("fiados")
    .select("id, owner_id, customer_id, concepto, valor, fecha, created_at")
    .eq("owner_id", usuarioActual.id)
    .eq("customer_id", clienteId)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (errorFiados) throw errorFiados;

  const listaFiados = fiados || [];
  const idsFiados = listaFiados.map((item) => item.id);
  let abonos = [];

  if (idsFiados.length) {
    const { data, error } = await supabase
      .from("abonos")
      .select("id, fiado_id, owner_id, valor, fecha, nota, created_at")
      .eq("owner_id", usuarioActual.id)
      .in("fiado_id", idsFiados)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    abonos = data || [];
  }

  const abonadoPorFiado = new Map();

  for (const abono of abonos) {
    abonadoPorFiado.set(
      abono.fiado_id,
      (abonadoPorFiado.get(abono.fiado_id) || 0) + Number(abono.valor || 0)
    );
  }

  let saldoTotal = 0;
  let fiadosPendientes = 0;

  for (const fiado of listaFiados) {
    const pendiente = Math.max(
      0,
      Number(fiado.valor || 0) - (abonadoPorFiado.get(fiado.id) || 0)
    );

    saldoTotal += pendiente;
    if (pendiente > 0) fiadosPendientes++;
  }

  texto($("saldoCliente"), dinero(saldoTotal));
  texto(
    $("cantidadFiados"),
    `${fiadosPendientes} fiado${fiadosPendientes === 1 ? "" : "s"} pendiente${fiadosPendientes === 1 ? "" : "s"}`
  );

  saldosPorCliente.set(clienteId, saldoTotal);
  actualizarResumen();
  pintarClientes();

  movimientosActuales = [
    ...listaFiados.map((fiado) => ({
      tipo: "fiado",
      id: fiado.id,
      valor: Number(fiado.valor || 0),
      fecha: fiado.fecha,
      created_at: fiado.created_at,
      concepto: fiado.concepto || "Fiado"
    })),
    ...abonos.map((abono) => ({
      tipo: "abono",
      id: abono.id,
      valor: Number(abono.valor || 0),
      fecha: abono.fecha,
      created_at: abono.created_at,
      concepto: abono.nota || "Abono recibido"
    }))
  ];

  movimientosActuales.sort((a, b) =>
    new Date(b.created_at || b.fecha || 0) -
    new Date(a.created_at || a.fecha || 0)
  );

  pintarMovimientos();
}

function pintarMovimientos() {
  const lista = $("listaFiados");
  lista.innerHTML = "";

  texto(
    $("cantidadMovimientos"),
    `${movimientosActuales.length} movimiento${movimientosActuales.length === 1 ? "" : "s"}`
  );

  if (!movimientosActuales.length) {
    lista.innerHTML = `<p class="muted small">Todavía no hay movimientos para este cliente.</p>`;
    return;
  }

  for (const movimiento of movimientosActuales) {
    const esAbono = movimiento.tipo === "abono";
    const fila = document.createElement("div");
    fila.className = "movement-item";

    fila.innerHTML = `
      <div class="movement-info">
        <strong>${esAbono ? "↓ Abono recibido" : "+ Fiado registrado"}</strong>
        <p>${escaparHTML(movimiento.concepto)}</p>
        <p>${escaparHTML(fechaLegible(movimiento.fecha))}</p>
      </div>
      <div class="movement-value ${esAbono ? "abono" : "deuda"}">
        ${esAbono ? "−" : "+"}${escaparHTML(dinero(movimiento.valor))}
      </div>
    `;

    lista.appendChild(fila);
  }
}

/* REGISTRAR FIADO */

async function guardarFiado(evento) {
  evento.preventDefault();

  if (!usuarioActual || !clienteSeleccionado) {
    mostrarToast("Primero abre la cuenta de un cliente.", "error");
    return;
  }

  const formulario = $("formularioFiado");
  limpiarMensaje("mensajeFiados");

  const valor = Number($("valorFiado").value);
  const concepto = $("conceptoFiado").value.trim();

  if (!Number.isInteger(valor) || valor <= 0) {
    mensaje("mensajeFiados", "Escribe un valor en pesos enteros mayor que cero.", "error");
    return;
  }

  // Con extensión: el mensaje sale solo desde WhatsApp Web.
  // Sin extensión: abrir la ventana de respaldo ahora, dentro del gesto
  // del usuario, para que el navegador no la bloquee como pop-up.
  const telefono = prepararNumeroWhatsApp(clienteSeleccionado.phone);
  const usarExtension = telefono ? await extensionDisponible() : false;
  let ventanaWhats = null;

  if (telefono && !usarExtension) {
    try {
      ventanaWhats = window.open("", "_blank");
    } catch {
      ventanaWhats = null;
    }
  }

  bloquearFormulario(formulario, true);

  try {
    const { error } = await supabase
      .from("fiados")
      .insert({
        owner_id: usuarioActual.id,
        customer_id: clienteSeleccionado.id,
        concepto: concepto || "Fiado",
        valor,
        fecha: hoyISO()
      });

    if (error) throw error;

    formulario.reset();
    mostrar(formulario, false);
    await cargarClientes();
    await cargarMovimientosCliente();

    const saldo = saldoDeCliente(clienteSeleccionado.id);
    const texto = textoMensajeFiado(clienteSeleccionado, valor, concepto, saldo);

    if (!telefono) {
      mostrarToast(
        "Fiado registrado. Este cliente no tiene celular para avisarle.",
        "error"
      );
    } else if (usarExtension && (await enviarPorExtension(telefono, texto)).ok) {
      mostrarToast("Fiado registrado. Mensaje enviado al cliente por WhatsApp.");
    } else {
      enviarMensajeWhatsApp(telefono, texto, ventanaWhats);
      mostrarToast("Fiado registrado correctamente.");
    }
  } catch (error) {
    if (ventanaWhats && !ventanaWhats.closed) ventanaWhats.close();
    console.error("Error guardando fiado:", error);
    mensaje("mensajeFiados", errorSupabase(error), "error");
  } finally {
    bloquearFormulario(formulario, false);
  }
}

/* REGISTRAR ABONO */

async function guardarAbono(evento) {
  evento.preventDefault();

  if (!usuarioActual || !clienteSeleccionado) {
    mostrarToast("Primero abre la cuenta de un cliente.", "error");
    return;
  }

  const formulario = $("formularioAbono");
  limpiarMensaje("mensajeAbonos");

  const valor = Number($("valorAbono").value);
  const nota = $("notaAbono").value.trim();
  const saldoActual = saldoDeCliente(clienteSeleccionado.id);

  if (!Number.isInteger(valor) || valor <= 0) {
    mensaje("mensajeAbonos", "Escribe un abono en pesos enteros mayor que cero.", "error");
    return;
  }

  if (saldoActual <= 0) {
    mensaje("mensajeAbonos", "Este cliente no tiene saldo pendiente.", "error");
    return;
  }

  if (valor > saldoActual) {
    mensaje(
      "mensajeAbonos",
      `El abono supera el saldo pendiente de ${dinero(saldoActual)}.`,
      "error"
    );
    return;
  }

  bloquearFormulario(formulario, true);

  try {
    const { error } = await supabase.rpc("registrar_abono_cliente", {
      p_customer_id: clienteSeleccionado.id,
      p_valor: valor,
      p_nota: nota || ""
    });

    if (error) throw error;

    formulario.reset();
    mostrar(formulario, false);
    await cargarClientes();
    await cargarMovimientosCliente();
    mostrarToast("Abono registrado correctamente.");
  } catch (error) {
    console.error("Error registrando abono:", error);
    mensaje("mensajeAbonos", errorSupabase(error), "error");
  } finally {
    bloquearFormulario(formulario, false);
  }
}

/* MOSTRAR Y OCULTAR FORMULARIOS */

function cerrarFormulariosMovimiento() {
  mostrar($("formularioFiado"), false);
  mostrar($("formularioAbono"), false);
  $("formularioFiado").reset();
  $("formularioAbono").reset();
  limpiarMensaje("mensajeFiados");
  limpiarMensaje("mensajeAbonos");
}

function abrirFormularioFiado() {
  if (!clienteSeleccionado) {
    mostrarToast("Selecciona un cliente primero.", "error");
    return;
  }

  mostrar($("formularioAbono"), false);
  mostrar($("formularioFiado"), true);
  $("formularioAbono").reset();
  limpiarMensaje("mensajeAbonos");
  $("valorFiado").focus();
}

function abrirFormularioAbono() {
  if (!clienteSeleccionado) {
    mostrarToast("Selecciona un cliente primero.", "error");
    return;
  }

  mostrar($("formularioFiado"), false);
  mostrar($("formularioAbono"), true);
  $("formularioFiado").reset();
  limpiarMensaje("mensajeFiados");

  if (saldoDeCliente(clienteSeleccionado.id) <= 0) {
    mensaje("mensajeAbonos", "Este cliente no tiene saldo pendiente.", "error");
    $("valorAbono").value = "";
    $("valorAbono").focus();
    return;
  }

  $("valorAbono").focus();
}


/* EVENTOS */

function conectarEventos() {
  function escuchar(id, evento, funcion) {
    const elemento = $(id);

    if (!elemento) {
      console.warn(`No se encontró el elemento HTML: #${id}`);
      return;
    }

    elemento.addEventListener(evento, funcion);
  }

  escuchar("btnMostrarRegistro", "click", verRegistro);
  escuchar("btnVolverLogin", "click", verLogin);

  // WhatsApp: el botón es opcional en el HTML.
  escuchar(
    "btnRecordatorioWhatsApp",
    "click",
    mensajeRecordatorioWhatsApp
  );

  escuchar("formLogin", "submit", iniciarSesion);
  escuchar("formRegistro", "submit", registrarCuenta);
  escuchar("btnCerrarSesion", "click", cerrarSesion);

  escuchar("btnMostrarFormulario", "click", () => {
    mostrar($("formularioCliente"), true);
    $("nombre").focus();
  });

  escuchar("btnPrimerCliente", "click", () => {
    mostrar($("formularioCliente"), true);
    $("nombre").focus();
  });

  escuchar("btnCancelar", "click", () => {
    $("formularioCliente").reset();
    mostrar($("formularioCliente"), false);
    limpiarMensaje("mensajeClientes");
  });

  escuchar("formularioCliente", "submit", guardarCliente);
  escuchar("buscarCliente", "input", pintarClientes);

  escuchar("listaClientes", "click", async (evento) => {
    const boton = evento.target.closest("[data-accion]");
    if (!boton) return;

    const accion = boton.dataset.accion;
    const clienteId = boton.dataset.id;
    if (!clienteId) return;

    try {
      if (accion === "abrir") {
        await abrirCuentaCliente(clienteId, false);
      }

      if (accion === "fiado") {
        await abrirCuentaCliente(clienteId, true);
      }
    } catch (error) {
      console.error("Error abriendo la cuenta:", error);
      mostrarToast(errorSupabase(error), "error");
    }
  });

  escuchar("btnCerrarFiados", "click", () => {
    cerrarCuentaCliente(true);
  });

  escuchar(
    "btnMostrarNuevoFiado",
    "click",
    abrirFormularioFiado
  );

  escuchar(
    "btnMostrarAbono",
    "click",
    abrirFormularioAbono
  );

  escuchar("btnCancelarFiado", "click", () => {
    $("formularioFiado").reset();
    mostrar($("formularioFiado"), false);
    limpiarMensaje("mensajeFiados");
  });

  escuchar("btnCancelarAbono", "click", () => {
    $("formularioAbono").reset();
    mostrar($("formularioAbono"), false);
    limpiarMensaje("mensajeAbonos");
  });

  escuchar("formularioFiado", "submit", guardarFiado);
  escuchar("formularioAbono", "submit", guardarAbono);
}

/* ARRANQUE */

async function iniciar() {
  conectarEventos();

  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (data.session?.user) {
      await iniciarAplicacion(data.session.user);
    } else {
      verAutenticacion();
    }
  } catch (error) {
    console.error("Error iniciando Fiado Fácil:", error);
    verAutenticacion();
    mensaje(
      "mensajeAuth",
      "No se pudo comprobar la sesión. Revisa tu conexión y la configuración de Supabase.",
      "error"
    );
  }
}

iniciar();


/* =========================================
   MENSAJES POR WHATSAPP
========================================= */

// Prepara un número colombiano para WhatsApp.
function prepararNumeroWhatsApp(telefono) {
  let numero = String(telefono || "").replace(/\D/g, "");

  // Si tiene 10 dígitos y empieza por 3, agregar Colombia.
  if (/^3\d{9}$/.test(numero)) {
    numero = "57" + numero;
  }

  // Si ya incluye el indicativo colombiano, conservarlo.
  if (/^57\d{10}$/.test(numero)) {
    return numero;
  }

  // Aceptar otros números internacionales completos.
  if (/^[1-9]\d{7,14}$/.test(numero)) {
    return numero;
  }

  return null;
}

// Abre WhatsApp con un mensaje escrito y listo para enviar.
function enviarMensajeWhatsApp(telefono, mensaje, ventana = null) {
  const numero = prepararNumeroWhatsApp(telefono);

  if (!numero) {
    if (ventana && !ventana.closed) ventana.close();
    mostrarToast(
      "El cliente no tiene un celular válido. Revisa su número.",
      "error"
    );
    return false;
  }

  const url =
    "https://wa.me/" +
    numero +
    "?text=" +
    encodeURIComponent(mensaje);

  if (ventana && !ventana.closed) {
    ventana.location.href = url;
    ventana.focus();
    return true;
  }

  if (!window.open(url, "_blank")) {
    navigator.clipboard
      ?.writeText(mensaje)
      .then(() =>
        mostrarToast(
          "No pudimos abrir WhatsApp. Copiamos el mensaje al portapapeles."
        )
      )
      .catch(() =>
        mostrarToast(
          "No pudimos abrir WhatsApp. Revisa los permisos del navegador.",
          "error"
        )
      );
    return false;
  }

  return true;
}

// Recordatorio de saldo pendiente.
function mensajeRecordatorioWhatsApp() {
  if (!clienteSeleccionado) {
    mostrarToast("Primero selecciona un cliente.", "error");
    return;
  }

  const saldo = saldoDeCliente(clienteSeleccionado.id);

  if (saldo <= 0) {
    mostrarToast("Este cliente no tiene deudas pendientes.");
    return;
  }

  const nombre = clienteSeleccionado.name;
  const telefono = clienteSeleccionado.phone;

  const mensaje =
    `Hola ${nombre}, te saludamos de parte de nuestro negocio. 😊\n\n` +
    `Te recordamos que tienes un saldo pendiente de ${dinero(saldo)}.\n\n` +
    `Cuando puedas, nos cuentas cuándo puedes realizar tu pago. ` +
    `¡Muchas gracias por tu confianza!`;

  enviarMensajeWhatsApp(telefono, mensaje);
}

// Texto del aviso de un nuevo fiado (compartido con la extensión).
function textoMensajeFiado(cliente, valor, concepto, saldo) {
  return (
    `Hola ${cliente.name}. 😊\n\n` +
    `Registramos un nuevo fiado en tu cuenta.\n` +
    `Detalle: ${concepto || "Compra en el negocio"}\n` +
    `Valor: ${dinero(valor)}\n` +
    `Saldo pendiente total: ${dinero(saldo)}\n\n` +
    `Gracias por tu confianza.`
  );
}

function mensajeNuevoFiadoWhatsApp(cliente, valor, concepto, saldo, ventana = null) {
  enviarMensajeWhatsApp(
    cliente.phone,
    textoMensajeFiado(cliente, valor, concepto, saldo),
    ventana
  );
}

/* EXTENSIÓN DE CHROME - ENVÍO AUTOMÁTICO */

const EXTENSION_ID = "COLOCA_AQUI_EL_ID_DE_TU_EXTENSION";
let extensionConfirmada = false;

function extensionDisponible() {
  if (extensionConfirmada) return Promise.resolve(true);

  return new Promise((resolver) => {
    if (!window.chrome?.runtime?.sendMessage || EXTENSION_ID.startsWith("COLOCA")) {
      resolver(false);
      return;
    }

    let contestada = false;
    const terminar = (valor) => {
      if (contestada) return;
      contestada = true;
      if (valor) extensionConfirmada = true;
      resolver(valor);
    };

    setTimeout(() => terminar(false), 700);

    try {
      chrome.runtime.sendMessage(EXTENSION_ID, { accion: "ping" }, (respuesta) => {
        terminar(!chrome.runtime.lastError && respuesta?.ok === true);
      });
    } catch {
      terminar(false);
    }
  });
}

function enviarPorExtension(telefono, texto) {
  return new Promise((resolver) => {
    let contestada = false;
    const terminar = (valor) => {
      if (contestada) return;
      contestada = true;
      resolver(valor);
    };

    setTimeout(() => terminar({ ok: false }), 2000);

    try {
      chrome.runtime.sendMessage(
        EXTENSION_ID,
        { accion: "enviar_whatsapp", telefono, texto },
        (respuesta) => {
          terminar({ ok: !chrome.runtime.lastError && respuesta?.ok === true });
        }
      );
    } catch {
      terminar({ ok: false });
    }
  });
}

// Confirmación de un abono.
function mensajeAbonoWhatsApp(cliente, valor, saldo) {
  const mensaje =
    `Hola ${cliente.name}. 😊\n\n` +
    `Confirmamos que registramos tu abono por ${dinero(valor)}.\n` +
    `Saldo pendiente actual: ${dinero(saldo)}.\n\n` +
    `¡Gracias por tu pago y por confiar en nosotros!`;

  enviarMensajeWhatsApp(cliente.phone, mensaje);
}
