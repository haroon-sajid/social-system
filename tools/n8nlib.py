"""Tiny helper to build n8n workflow JSON with consistent ids and connections.

Run any build_*.py from anywhere: the JSON is written to ../n8n next to this folder
(or to the folder in the N8N_OUT_DIR environment variable).
"""
import json
import os
import uuid

OUT_DIR = os.environ.get("N8N_OUT_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "n8n")

SUPA = "https://qpmsrznvleogzjnovsmw.supabase.co"
GRAPH = "https://graph.facebook.com/v25.0"
THREADS = "https://graph.threads.net/v1.0"
LI_VERSION = "202609"

# Credential names the user creates once in n8n
CRED_SUPA = ("httpCustomAuth", "Supabase Service Key")
CRED_META = ("httpQueryAuth", "Meta Page Token")
CRED_THREADS = ("httpQueryAuth", "Threads Token")
CRED_LI = ("httpHeaderAuth", "LinkedIn Bearer")
CRED_WEBHOOK = ("httpHeaderAuth", "Publish Webhook Secret")
CRED_GEMINI = ("httpHeaderAuth", "Gemini API Key")


class WF:
    def __init__(self, name):
        self.name = name
        self.nodes = []
        self.conns = {}
        self._names = set()

    def add(self, name, type_, version, params, pos, creds=None, on_error=None, extra=None):
        assert name not in self._names, f"duplicate node {name}"
        self._names.add(name)
        node = {
            "parameters": params,
            "id": str(uuid.uuid5(uuid.NAMESPACE_URL, self.name + "/" + name)),
            "name": name,
            "type": type_,
            "typeVersion": version,
            "position": list(pos),
        }
        if creds:
            ctype, cname = creds
            node["credentials"] = {ctype: {"name": cname}}
        if on_error:
            node["onError"] = on_error
        if extra:
            node.update(extra)
        self.nodes.append(node)
        return name

    def link(self, a, b, out=0, inp=0, kind="main"):
        assert a in self._names, f"unknown source {a}"
        assert b in self._names, f"unknown target {b}"
        outs = self.conns.setdefault(a, {}).setdefault(kind, [])
        while len(outs) <= out:
            outs.append([])
        outs[out].append({"node": b, "type": kind, "index": inp})

    def dump(self, filename, settings=None):
        os.makedirs(OUT_DIR, exist_ok=True)
        path = os.path.join(OUT_DIR, os.path.basename(filename))
        wf = {
            "name": self.name,
            "nodes": self.nodes,
            "connections": self.conns,
            "active": False,
            "settings": settings or {"executionOrder": "v1", "timezone": "Asia/Karachi"},
            "pinData": {},
            "meta": {"templateCredsSetupCompleted": False},
        }
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            json.dump(wf, f, indent=2)
            f.write("\n")
        return wf


# ---------- node factories ----------

def http(url, method="GET", body=None, creds=CRED_SUPA, headers=None, options=None, query=None):
    """body is an n8n expression string (starting with ={{ ) producing a JSON string."""
    ctype = creds[0] if creds else None
    p = {"method": method, "url": url}
    if creds:
        p["authentication"] = "genericCredentialType"
        p["genericAuthType"] = ctype
    if query:
        p["sendQuery"] = True
        p["queryParameters"] = {"parameters": [{"name": k, "value": v} for k, v in query]}
    if headers:
        p["sendHeaders"] = True
        p["headerParameters"] = {"parameters": [{"name": k, "value": v} for k, v in headers]}
    if body is not None:
        p["sendBody"] = True
        p["specifyBody"] = "json"
        p["jsonBody"] = body
    p["options"] = options or {}
    return p


def rpc(fn, body_expr):
    return http(f"{SUPA}/rest/v1/rpc/{fn}", "POST", body_expr)


def code(js, mode="runOnceForAllItems"):
    p = {"jsCode": js}
    if mode != "runOnceForAllItems":
        p["mode"] = mode
    return p


def cond(left, op_type, operation, right=None, single=False):
    c = {
        "id": str(uuid.uuid4()),
        "leftValue": left,
        "operator": {"type": op_type, "operation": operation},
    }
    if single:
        c["operator"]["singleValue"] = True
    c["rightValue"] = right if right is not None else ""
    return c


def conditions(*conds):
    return {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "loose", "version": 2},
        "conditions": list(conds),
        "combinator": "and",
    }


def if_params(*conds):
    return {"conditions": conditions(*conds), "looseTypeValidation": True, "options": {}}


def switch_params(field_expr, values, fallback=True):
    rules = []
    for v in values:
        rules.append({
            "conditions": conditions(cond(field_expr, "string", "equals", v)),
            "renameOutput": True,
            "outputKey": v,
        })
    p = {"rules": {"values": rules}, "options": {}}
    if fallback:
        p["options"]["fallbackOutput"] = "extra"
    return p


T_HTTP = ("n8n-nodes-base.httpRequest", 4.2)
T_CODE = ("n8n-nodes-base.code", 2)
T_IF = ("n8n-nodes-base.if", 2.2)
T_SWITCH = ("n8n-nodes-base.switch", 3.2)
T_SPLITOUT = ("n8n-nodes-base.splitOut", 1)
T_AGG = ("n8n-nodes-base.aggregate", 1)
T_WAIT = ("n8n-nodes-base.wait", 1.1)
T_LOOP = ("n8n-nodes-base.splitInBatches", 3)
T_NOOP = ("n8n-nodes-base.noOp", 1)
T_SCHED = ("n8n-nodes-base.scheduleTrigger", 1.2)
T_WEBHOOK = ("n8n-nodes-base.webhook", 2)
T_MCP = ("@n8n/n8n-nodes-langchain.mcpTrigger", 2)
T_HTTPTOOL = ("n8n-nodes-base.httpRequestTool", 4.2)
T_STICKY = ("n8n-nodes-base.stickyNote", 1)
