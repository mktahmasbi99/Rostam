const ROSTAM_BUILD_ID = "__ROSTAM_BUILD_ID__";
const PREPARE_TIMEOUT_MS = 5000;
let activeTransaction = null;

async function rostamClients() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

function rosterId(client) {
  return client.id;
}

function askClient(client, message) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => { channel.port1.close(); resolve(null); }, PREPARE_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };
    client.postMessage(message, [channel.port2]);
  });
}

async function abortTransaction(transactionId, clients, reason) {
  for (const client of clients) client.postMessage({ type: "ROSTAM_ABORT_RESTART", transactionId, reason });
  if (activeTransaction === transactionId) activeTransaction = null;
}

async function prepareAndActivate(event) {
  const request = event.data;
  if (activeTransaction) {
    event.source?.postMessage({ type: "ROSTAM_UPDATE_BLOCKED", transactionId: request.transactionId, reason: "Another update is already being prepared." });
    event.ports[0]?.postMessage({ ready: false, reason: "Another update is already being prepared." });
    return;
  }
  const transactionId = request.transactionId;
  activeTransaction = transactionId;
  let clients = await rostamClients();
  const clientsById = new Map(clients.map((client) => [rosterId(client), client]));
  const prepare = async () => Promise.all(clients.map((client) => askClient(client, {
    type: "ROSTAM_PREPARE_RESTART", transactionId, buildId: ROSTAM_BUILD_ID,
    clientId: request.clientId, discardConfirmed: request.discardConfirmed === true,
  })));
  const first = await Promise.race([
    prepare(),
    new Promise((resolve) => setTimeout(() => resolve(null), PREPARE_TIMEOUT_MS)),
  ]);
  const failed = !first || first.some((reply) => !reply?.ready || reply.transactionId !== transactionId);
  if (failed) {
    await abortTransaction(transactionId, clients, first?.find((reply) => !reply?.ready)?.reason ?? "An open tab did not respond.");
    event.ports[0]?.postMessage({ ready: false, reason: first?.find((reply) => !reply?.ready)?.reason ?? "An open tab did not respond." });
    event.source?.postMessage({ type: "ROSTAM_UPDATE_BLOCKED", transactionId, reason: first?.find((reply) => !reply?.ready)?.reason ?? "An open tab did not respond." });
    return;
  }
  clients = await rostamClients();
  const sameClients = clients.length === clientsById.size && clients.every((client) => clientsById.has(rosterId(client)));
  const confirmed = sameClients ? await Promise.all(clients.map((client) => askClient(client, {
    type: "ROSTAM_CONFIRM_RESTART", transactionId, buildId: ROSTAM_BUILD_ID,
    clientId: request.clientId, discardConfirmed: request.discardConfirmed === true,
  }))) : null;
  if (!sameClients || !confirmed?.every((reply) => reply?.ready && reply.transactionId === transactionId)) {
    await abortTransaction(transactionId, clients, "The open tabs changed while the update was being prepared.");
    event.ports[0]?.postMessage({ ready: false, reason: "The open tabs changed while the update was being prepared." });
    event.source?.postMessage({ type: "ROSTAM_UPDATE_BLOCKED", transactionId, reason: "The open tabs changed while the update was being prepared." });
    return;
  }
  event.ports[0]?.postMessage({ ready: true, transactionId });
  await self.skipWaiting();
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "ROSTAM_REQUEST_RESTART") event.waitUntil(prepareAndActivate(event));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const clients = await rostamClients();
    for (const client of clients) client.postMessage({ type: "ROSTAM_COMMIT_RESTART", transactionId: activeTransaction, buildId: ROSTAM_BUILD_ID });
  })());
});
