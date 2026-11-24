"""Social 1 - One Click Publish: dashboard click -> publish one version -> return result. No cron, no queue."""
import uuid
from n8nlib import *

w = WF("Social 1 - One Click Publish")
JOB = "$('Start Publish').first().json"
RETRY = {"retryOnFail": True, "maxTries": 3, "waitBetweenTries": 4000}

READ_ERR = r"""
// Turns an HTTP error into one readable sentence, for example "Version not found" or Meta's error_user_msg.
// n8n wraps API errors as: 400 - "{\"message\":\"...\"}", so unwrap that first.
function readErr(raw) {
  const e = raw?.error ?? raw ?? {};
  if (typeof e === 'string') return e.slice(0, 1500);
  const pick = (v) => {
    if (!v) return null;
    let j = v;
    if (typeof v === 'string') {
      let s = v;
      const m = v.match(/^\d{3} - ("[\s\S]*")$/);
      if (m) { try { s = JSON.parse(m[1]); } catch (_) {} }
      try { j = JSON.parse(s); } catch (_) { return s; }
    }
    const msg = j?.error?.error_user_msg || j?.error?.message || j?.message || j?.error_description || j?.error;
    return typeof msg === 'string' ? msg : null;
  };
  return (pick(e.description) || pick(e.message) || 'Unknown error').slice(0, 1500);
}
"""

# 1. Entry
w.add("Publish Webhook", *T_WEBHOOK,
      {"httpMethod": "POST", "path": "social-publish", "authentication": "headerAuth",
       "responseMode": "responseNode", "options": {}},
      (0, 300), creds=CRED_WEBHOOK, extra={"webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "social-publish"))})
w.add("Start Publish", *T_HTTP,
      rpc("start_publish", "={{ JSON.stringify({ p_variant_id: $json.body.variant_id }) }}"),
      (220, 300), creds=CRED_SUPA, on_error="continueErrorOutput")
w.add("Start Failed", *T_CODE, code(READ_ERR + r"""
return [{ json: { ok: false, error: readErr($input.first().json) } }];
"""), (440, 600))
w.add("Reply Not Started", "n8n-nodes-base.respondToWebhook", 1.1,
      {"respondWith": "json", "responseBody": "={{ JSON.stringify($json) }}", "options": {"responseCode": 409}},
      (660, 600))
w.add("Route Platform", *T_SWITCH,
      switch_params("={{ $json.platform }}", ["facebook", "instagram", "threads", "linkedin"], fallback=False), (440, 300))

# 2. Facebook Page: one call (photo or text)
w.add("Facebook Post", *T_HTTP, http(
    f"={GRAPH}/{{{{ $json.account_id }}}}/{{{{ $json.image_url ? 'photos' : 'feed' }}}}", "POST",
    "={{ JSON.stringify($json.image_url ? { url: $json.image_url, message: $json.text } "
    ": Object.assign({ message: $json.text }, $json.link_url ? { link: $json.link_url } : {})) }}",
    creds=CRED_META), (700, 0), creds=CRED_META, on_error="continueErrorOutput")

# 3. Instagram: create container, short wait, publish (retries if not ready)
w.add("Instagram Create", *T_HTTP, http(
    f"={GRAPH}/{{{{ $json.account_id }}}}/media", "POST",
    "={{ JSON.stringify({ image_url: $json.image_url, caption: $json.text }) }}", creds=CRED_META),
    (700, 200), creds=CRED_META, on_error="continueErrorOutput")
w.add("Instagram Wait", *T_WAIT, {"resume": "timeInterval", "amount": 5, "unit": "seconds"}, (920, 200),
      extra={"webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "ig-wait"))})
w.add("Instagram Publish", *T_HTTP, http(
    f"={GRAPH}/{{{{ {JOB}.account_id }}}}/media_publish", "POST",
    "={{ JSON.stringify({ creation_id: $json.id }) }}", creds=CRED_META),
    (1140, 200), creds=CRED_META, on_error="continueErrorOutput", extra=RETRY)
# The publish call only returns an id, so ask for the public link. If this fails the post is still published.
w.add("Instagram Link", *T_HTTP, http(
    f"={GRAPH}/{{{{ $json.id }}}}?fields=permalink", creds=CRED_META),
    (1360, 150), creds=CRED_META, on_error="continueRegularOutput")

# 4. Threads: same pattern
w.add("Threads Create", *T_HTTP, http(
    f"={THREADS}/{{{{ $json.account_id }}}}/threads", "POST",
    "={{ JSON.stringify($json.image_url ? { media_type: 'IMAGE', image_url: $json.image_url, text: $json.text } "
    ": { media_type: 'TEXT', text: $json.text }) }}", creds=CRED_THREADS),
    (700, 400), creds=CRED_THREADS, on_error="continueErrorOutput")
w.add("Threads Wait", *T_WAIT, {"resume": "timeInterval", "amount": 5, "unit": "seconds"}, (920, 400),
      extra={"webhookId": str(uuid.uuid5(uuid.NAMESPACE_URL, "th-wait"))})
w.add("Threads Publish", *T_HTTP, http(
    f"={THREADS}/{{{{ {JOB}.account_id }}}}/threads_publish", "POST",
    "={{ JSON.stringify({ creation_id: $json.id }) }}", creds=CRED_THREADS),
    (1140, 400), creds=CRED_THREADS, on_error="continueErrorOutput", extra=RETRY)
w.add("Threads Link", *T_HTTP, http(
    f"={THREADS}/{{{{ $json.id }}}}?fields=permalink", creds=CRED_THREADS),
    (1360, 380), creds=CRED_THREADS, on_error="continueRegularOutput")

# 5. LinkedIn: optional image upload, then post
LI_HEADERS = [("LinkedIn-Version", LI_VERSION), ("X-Restli-Protocol-Version", "2.0.0")]
w.add("LinkedIn Has Image?", *T_IF, if_params(cond("={{ $json.image_url }}", "string", "notEmpty", single=True)), (700, 650))
w.add("LinkedIn Init Upload", *T_HTTP, http(
    "https://api.linkedin.com/rest/images?action=initializeUpload", "POST",
    "={{ JSON.stringify({ initializeUploadRequest: { owner: $json.li_author } }) }}", creds=CRED_LI, headers=LI_HEADERS),
    (920, 550), creds=CRED_LI, on_error="continueErrorOutput")
w.add("LinkedIn Get Image", *T_HTTP, http(
    f"={{{{ {JOB}.image_url }}}}", "GET", creds=None,
    options={"response": {"response": {"responseFormat": "file"}}}), (1140, 550), on_error="continueErrorOutput")
li_up = http("={{ $('LinkedIn Init Upload').first().json.value.uploadUrl }}", "PUT", creds=CRED_LI)
li_up.update({"sendBody": True, "contentType": "binaryData", "inputDataFieldName": "data"})
w.add("LinkedIn Upload Image", *T_HTTP, li_up, (1360, 550), creds=CRED_LI, on_error="continueErrorOutput")
w.add("LinkedIn Post", *T_HTTP, http(
    "https://api.linkedin.com/rest/posts", "POST",
    "={{ JSON.stringify(Object.assign({ author: " + JOB + ".li_author, commentary: " + JOB + ".li_commentary, "
    "visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, "
    "lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false }, "
    "$('LinkedIn Init Upload').isExecuted ? { content: { media: { id: $('LinkedIn Init Upload').first().json.value.image } } } : {})) }}",
    creds=CRED_LI, headers=LI_HEADERS, options={"response": {"response": {"fullResponse": True}}}),
    (1580, 700), creds=CRED_LI, on_error="continueErrorOutput")

# 6. Result handling (shared)
w.add("Success", *T_CODE, code(r"""
const job = $('Start Publish').first().json;
const r = $input.first().json;
let id = null, url = null;
if (job.platform === 'facebook') { id = String(r.post_id || r.id); url = `https://www.facebook.com/${id}`; }
if (job.platform === 'instagram' || job.platform === 'threads') {
  // The id comes from the publish step; the link step may have failed (then there is no url, nothing else changes)
  const pub = $(job.platform === 'instagram' ? 'Instagram Publish' : 'Threads Publish').first().json;
  id = String(pub.id);
  url = typeof r.permalink === 'string' ? r.permalink : null;
}
if (job.platform === 'linkedin') {
  const h = r.headers || {};
  id = h['x-restli-id'] || h['X-RestLi-Id'] || null;
  url = id ? `https://www.linkedin.com/feed/update/${id}/` : null;
}
return [{ json: { variant_id: job.variant_id, success: true, platform_post_id: id, url, error: null } }];
"""), (1800, 200))
w.add("Build Error", *T_CODE, code(READ_ERR + r"""
const job = $('Start Publish').first().json;
return [{ json: { variant_id: job.variant_id, success: false, platform_post_id: null, url: null,
  error: `${job.platform}: ${readErr($input.first().json)}` } }];
"""), (1800, 450))
w.add("Save Result", *T_HTTP, rpc("finish_publish",
      "={{ JSON.stringify({ p_variant_id: $json.variant_id, p_success: $json.success, "
      "p_platform_post_id: $json.platform_post_id, p_platform_post_url: $json.url, p_error: $json.error }) }}"),
      (2020, 300), creds=CRED_SUPA, on_error="continueRegularOutput", extra=RETRY)
w.add("Reply Result", "n8n-nodes-base.respondToWebhook", 1.1,
      {"respondWith": "json",
       "responseBody": "={{ JSON.stringify($('Success').isExecuted "
                       "? { ok: true, url: $('Success').first().json.url } "
                       ": { ok: false, error: $('Build Error').first().json.error }) }}",
       "options": {}},
      (2240, 300))

# Wiring
w.link("Publish Webhook", "Start Publish")
w.link("Start Publish", "Route Platform", 0)
w.link("Start Publish", "Start Failed", 1)
w.link("Start Failed", "Reply Not Started")
w.link("Route Platform", "Facebook Post", 0)
w.link("Route Platform", "Instagram Create", 1)
w.link("Route Platform", "Threads Create", 2)
w.link("Route Platform", "LinkedIn Has Image?", 3)
w.link("Instagram Create", "Instagram Wait", 0)
w.link("Instagram Wait", "Instagram Publish")
w.link("Threads Create", "Threads Wait", 0)
w.link("Threads Wait", "Threads Publish")
w.link("LinkedIn Has Image?", "LinkedIn Init Upload", 0)
w.link("LinkedIn Has Image?", "LinkedIn Post", 1)
w.link("LinkedIn Init Upload", "LinkedIn Get Image", 0)
w.link("LinkedIn Get Image", "LinkedIn Upload Image", 0)
w.link("LinkedIn Upload Image", "LinkedIn Post", 0)
w.link("Instagram Publish", "Instagram Link", 0)
w.link("Threads Publish", "Threads Link", 0)
for n in ("Facebook Post", "Instagram Link", "Threads Link", "LinkedIn Post"):
    w.link(n, "Success", 0)
for n in ("Facebook Post", "Instagram Create", "Instagram Publish", "Threads Create", "Threads Publish",
          "LinkedIn Init Upload", "LinkedIn Get Image", "LinkedIn Upload Image", "LinkedIn Post"):
    w.link(n, "Build Error", 1)
w.link("Success", "Save Result")
w.link("Build Error", "Save Result")
w.link("Save Result", "Reply Result")

w.add("Note", *T_STICKY, {"content": (
    "## One Click Publish\n"
    "The dashboard sends one version id. Supabase checks it, locks it (no double posts) and returns the ready text.\n"
    "This workflow posts it and replies with the link or the exact error.\n"
    "Supports text plus 1 image. Videos are posted by hand."), "height": 200, "width": 420}, (-40, -40))

w.dump("social-1-one-click-publish.json",
       {"executionOrder": "v1", "timezone": "Asia/Karachi",
        "saveDataSuccessExecution": "all", "saveDataErrorExecution": "all"})
print("nodes", len(w.nodes))
