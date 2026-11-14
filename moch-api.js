// mock-api.js - runs the 3 APIs the BPMN REST connectors call.
// Run:  node mock-api.js     (needs only Node.js, no npm install)

const http = require("http");

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

// ---------- 8081: Credit assessment (loan-approval.bpmn) ----------
// Test trick: applicantId starting with GOOD -> 780, MID -> 650, BAD -> 500
http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url.startsWith("/api/credit/assess")) {
    const b = await readBody(req);
    const id = String(b.applicantId || "");
    let score;
    if (id.startsWith("GOOD")) score = 780;
    else if (id.startsWith("MID")) score = 650;
    else if (id.startsWith("BAD")) score = 500;
    else score = 500 + ([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 351);
    const riskBand = score >= 700 ? "LOW" : score >= 550 ? "MEDIUM" : "HIGH";
    console.log("[credit]", b, "->", score);
    return send(res, 200, { creditScore: score, riskBand, reference: "CR-" + Date.now() });
  }
  send(res, 404, { error: "not found" });
}).listen(8081, () => console.log("Credit API   -> http://localhost:8081/api/credit/assess"));

// ---------- 8082: Payment (order-fulfilment.bpmn) ----------
// Test trick: paymentToken "FAIL" or "DECLINE" -> DECLINED, anything else APPROVED
http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url.startsWith("/api/payments/charge")) {
    const b = await readBody(req);
    const token = String(b.paymentToken || "").toUpperCase();
    const declined = token === "FAIL" || token === "DECLINE";
    console.log("[payment]", b, "->", declined ? "DECLINED" : "APPROVED");
    return send(res, 200, {
      status: declined ? "DECLINED" : "APPROVED",
      transactionId: "TX-" + Date.now(),
      message: declined ? "Payment declined" : "Payment successful",
    });
  }
  send(res, 404, { error: "not found" });
}).listen(8082, () => console.log("Payment API  -> http://localhost:8082/api/payments/charge"));

// ---------- 8083: Scheduling slots (patient-triage.bpmn) ----------
// Test trick: department "NOSLOT" -> zero slots (goes to manual 'no slot' review)
http.createServer((req, res) => {
  if (req.method === "GET" && req.url.startsWith("/api/scheduling/slots")) {
    const q = new URL(req.url, "http://localhost").searchParams;
    const dept = q.get("department") || "General";
    const slotType = q.get("slotType") || "ROUTINE";
    const tod = (q.get("timeOfDay") || "").toLowerCase();
    const hours = tod.startsWith("aft") ? [14, 15, 16] : [9, 10, 11];
    const start = q.get("from") ? new Date(q.get("from")) : new Date();
    const base = isNaN(start) ? new Date() : start;

    let slots = hours.map((h, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + (slotType === "PRIORITY" ? 0 : 1 + i));
      d.setHours(h, 0, 0, 0);
      return { slotId: "S-" + (i + 1), department: dept, slotType, start: d.toISOString() };
    });
    if (dept.toUpperCase() === "NOSLOT") slots = [];
    console.log("[slots]", Object.fromEntries(q), "->", slots.length, "slots");
    return send(res, 200, { slots, count: slots.length });
  }
  send(res, 404, { error: "not found" });
}).listen(8083, () => console.log("Slots API    -> http://localhost:8083/api/scheduling/slots"));
