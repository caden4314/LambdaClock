import {For,Show,createMemo,createSignal,onCleanup,onMount} from 'solid-js';

const API='/api/auth';
const DEFAULT_SCOPE='api:access';

function formatTime(value){
  if(!value)return 'never';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value):date.toLocaleString();
}
function scopeList(value){
  return String(value||'').split(/[\s,]+/).map(v=>v.trim().toLowerCase()).filter(Boolean);
}
async function jsonRequest(path,options={}){
  const response=await fetch(path,{
    credentials:'same-origin',
    cache:'no-store',
    ...options,
    headers:{
      Accept:'application/json',
      'X-Requested-With':'XMLHttpRequest',
      ...(options.headers||{})
    }
  });
  let data={};
  try{data=await response.json()}catch{}
  if(response.status===428&&data.verification_url){
    globalThis.location.href=data.verification_url;
    throw Object.assign(new Error('Management verification required.'),{handled:true});
  }
  if(!response.ok)throw Object.assign(new Error(data.message||`HTTP ${response.status}`),{status:response.status,data});
  return data;
}

export default function AuthKeyConsole(props){
  const [state,setState]=createSignal('loading');
  const [keys,setKeys]=createSignal([]);
  const [audit,setAudit]=createSignal([]);
  const [csrf,setCsrf]=createSignal('');
  const [policy,setPolicy]=createSignal(null);
  const [currentModel,setCurrentModel]=createSignal(null);
  const [modelStatus,setModelStatus]=createSignal('unknown');
  const [error,setError]=createSignal('');
  const [issued,setIssued]=createSignal(null);
  const [copied,setCopied]=createSignal(false);
  const [busy,setBusy]=createSignal('');
  const [label,setLabel]=createSignal('');
  const [scopes,setScopes]=createSignal(DEFAULT_SCOPE);
  const [ttl,setTtl]=createSignal('90');
  let wipeTimer,copyTimer;

  const activeCount=createMemo(()=>keys().filter(key=>key.status==='active').length);
  const parsedScopes=createMemo(()=>scopeList(scopes()));

  const armWipe=payload=>{
    clearTimeout(wipeTimer);setIssued(payload);setCopied(false);
    wipeTimer=setTimeout(()=>setIssued(null),120000);
  };
  const load=async()=>{
    setError('');
    try{
      const data=await jsonRequest(`${API}/keys`);
      setKeys(Array.isArray(data.keys)?data.keys:[]);
      setAudit(Array.isArray(data.audit)?data.audit:[]);
      setCsrf(String(data.csrf_token||''));
      setPolicy(data.policy||null);
      setCurrentModel(data.current_model||null);
      setModelStatus(String(data.model_status||'unknown'));
      setState('ready');
    }catch(err){
      if(err?.handled)return;
      if(err?.status===401)setState('login');
      else if(err?.status===403)setState('forbidden');
      else{setState('error');setError(err?.message||'Unable to load authorization keys.')}
    }
  };
  const mutation=async(path,body)=>jsonRequest(path,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-CSRF-Token':csrf()},
    body:JSON.stringify(body)
  });

  const issue=async event=>{
    event.preventDefault();
    if(!label().trim()||!parsedScopes().length)return;
    setBusy('issue');setError('');
    try{
      const data=await mutation(`${API}/keys/issue`,{label:label().trim(),scopes:parsedScopes(),ttl_days:Number(ttl())});
      armWipe({key:String(data.key||''),metadata:data.metadata});
      setLabel('');setScopes(DEFAULT_SCOPE);
      await load();
    }catch(err){if(!err?.handled)setError(err?.message||'Key issuance failed.')}finally{setBusy('')}
  };
  const revoke=async key=>{
    if(!globalThis.confirm?.(`Revoke ${key.label}? Existing clients using this key will stop authenticating.`))return;
    setBusy(`revoke:${key.key_id}`);setError('');
    try{await mutation(`${API}/keys/revoke`,{key_id:key.key_id});await load()}
    catch(err){if(!err?.handled)setError(err?.message||'Key revocation failed.')}finally{setBusy('')}
  };
  const rotate=async key=>{
    if(!globalThis.confirm?.(`Rotate ${key.label}? The old key is revoked immediately.`))return;
    setBusy(`rotate:${key.key_id}`);setError('');
    try{
      const data=await mutation(`${API}/keys/rotate`,{key_id:key.key_id});
      armWipe({key:String(data.key||''),metadata:data.metadata});
      await load();
    }catch(err){if(!err?.handled)setError(err?.message||'Key rotation failed.')}finally{setBusy('')}
  };
  const copyKey=async()=>{
    const value=issued()?.key;if(!value)return;
    try{await globalThis.navigator?.clipboard?.writeText?.(value);setCopied(true);clearTimeout(copyTimer);copyTimer=setTimeout(()=>setCopied(false),1800)}catch{setError('Clipboard access was denied. Select the key and copy it manually.')}
  };
  const dismissSecret=()=>{clearTimeout(wipeTimer);setIssued(null);setCopied(false)};

  onCleanup(()=>{clearTimeout(wipeTimer);clearTimeout(copyTimer);setIssued(null)});
  onMount(load);

  return <aside class="auth-console" aria-label="Secure authorization key manager">
    <header class="auth-console__head">
      <div><b>AUTH KEY COMPUTER</b><span>{activeCount()} ACTIVE</span></div>
      <button type="button" onClick={props.onClose} aria-label="Close authorization key manager">CLOSE</button>
    </header>

    <div class="auth-console__trust">SHARED VISUAL MODEL ANCHOR <i>•</i> SERVER CSPRNG NONCE <i>•</i> HMAC-SHA-256 DERIVATION</div>

    <Show when={state()==='loading'}><div class="auth-console__message">ESTABLISHING SECURE MANAGEMENT SESSION…</div></Show>
    <Show when={state()==='login'}><div class="auth-console__message"><b>SIGN-IN REQUIRED</b><span>Authenticate with Scenic Route Discord before managing keys.</span><a href="/auth/discord">SIGN IN</a></div></Show>
    <Show when={state()==='forbidden'}><div class="auth-console__message"><b>NETWORK ACCESS REQUIRED</b><span>Your Scenic Route account does not have permission to issue authorization keys.</span></div></Show>
    <Show when={state()==='error'}><div class="auth-console__message"><b>MANAGER OFFLINE</b><span>{error()}</span><button type="button" onClick={load}>RETRY</button></div></Show>

    <Show when={state()==='ready'}>
      <div class="auth-console__scroll">
        <section class="auth-model">
          <div class="auth-section-title"><span>SHARED VISUAL MODEL</span><b>{modelStatus().toUpperCase()}</b></div>
          <Show when={currentModel()} fallback={<p class="auth-empty">MODEL OFFLINE — KEY MINTING IS LOCKED</p>}>{model=>{
            const state=()=>model().state||{};
            return <dl><dt>WORLD</dt><dd>{state().seed||'—'}</dd><dt>STEP</dt><dd>{Number(state().step||0).toLocaleString()}</dd><dt>ANCHOR</dt><dd>{model().anchor||'—'}</dd><dt>STATE</dt><dd>{state().x??'—'}, {state().y??'—'} · {state().heading||'—'} · FNV {state().fnv64||'—'}</dd></dl>;
          }}</Show>
          <small>Every new or rotated key is derived from the exact authoritative checkpoint shown here. The shared model is public; server-only key material keeps the resulting bearer key unpredictable.</small>
        </section>
        <Show when={issued()}>{secret=><section class="auth-secret">
          <div class="auth-section-title"><span>ONE-TIME SECRET</span><b>SAVE NOW</b></div>
          <p>This model-derived bearer key is returned once, never stored in raw form, and disappears from this page after two minutes.</p>
          <textarea readOnly spellcheck={false} autocomplete="off" value={secret().key}/>
          <div class="auth-actions"><button type="button" onClick={copyKey}>{copied()?'COPIED':'COPY KEY'}</button><button type="button" onClick={dismissSecret}>I SAVED IT</button></div>
          <small>MODEL STEP {Number(secret().metadata?.model?.step||0).toLocaleString()} · ANCHOR {secret().metadata?.model_anchor_tag||'—'} · FINGERPRINT {secret().metadata?.fingerprint||'—'}</small>
        </section>}</Show>

        <section class="auth-issue">
          <div class="auth-section-title"><span>MINT FROM SHARED MODEL</span><b>{policy()?.default_ttl_days||90}D DEFAULT</b></div>
          <form onSubmit={issue} autocomplete="off">
            <label>LABEL<input maxlength="80" value={label()} onInput={e=>setLabel(e.currentTarget.value)} placeholder="beammp-controller" required/></label>
            <label>SCOPES<input value={scopes()} onInput={e=>setScopes(e.currentTarget.value)} placeholder="events:read, events:write" required/></label>
            <label>LIFETIME<select value={ttl()} onChange={e=>setTtl(e.currentTarget.value)}><option value="7">7 DAYS</option><option value="30">30 DAYS</option><option value="90">90 DAYS</option><option value="365">365 DAYS</option></select></label>
            <button class="auth-primary" type="submit" disabled={busy()!==''||modelStatus()!=='online'||!label().trim()||!parsedScopes().length}>{busy()==='issue'?'DERIVING…':modelStatus()==='online'?'MINT MODEL-DERIVED KEY':'MODEL OFFLINE'}</button>
          </form>
          <small>The server captures a fresh Shared Visual Model checkpoint when you mint. Scopes accept exact names such as <code>events:read</code>, namespace wildcards such as <code>events:*</code>, or <code>*</code>.</small>
        </section>

        <section class="auth-keys">
          <div class="auth-section-title"><span>KEY RING</span><b>{keys().length} TOTAL</b></div>
          <Show when={keys().length} fallback={<p class="auth-empty">NO KEYS ISSUED</p>}>
            <For each={keys()}>{key=><article class={`auth-key auth-key--${key.status}`}>
              <div class="auth-key__top"><b>{key.label}</b><span>{key.status}</span></div>
              <code>{key.prefix}_••••••••••••••••</code>
              <dl><dt>MODEL</dt><dd>step {Number(key.model?.step||0).toLocaleString()} · {key.model_anchor_tag||'—'}</dd><dt>FP</dt><dd>{key.fingerprint}</dd><dt>SCOPE</dt><dd>{(key.scopes||[]).join(' ')}</dd><dt>EXPIRES</dt><dd>{formatTime(key.expires_at)}</dd><dt>USED</dt><dd>{key.last_used_at?formatTime(key.last_used_at):'never'} · {key.use_count||0}</dd></dl>
              <Show when={key.status==='active'}><div class="auth-actions"><button type="button" disabled={busy()!==''} onClick={()=>rotate(key)}>{busy()===`rotate:${key.key_id}`?'ROTATING…':'ROTATE'}</button><button type="button" class="danger" disabled={busy()!==''} onClick={()=>revoke(key)}>{busy()===`revoke:${key.key_id}`?'REVOKING…':'REVOKE'}</button></div></Show>
            </article>}</For>
          </Show>
        </section>

        <Show when={audit().length}><section class="auth-audit"><div class="auth-section-title"><span>RECENT AUDIT</span><b>SERVER LOG</b></div><For each={audit().slice(0,12)}>{event=><div><time>{formatTime(event.occurred_at)}</time><b>{event.action}</b><code>{event.key_id}</code></div>}</For></section></Show>
      </div>
    </Show>
    <Show when={error()&&state()==='ready'}><div class="auth-console__error">{error()}</div></Show>
  </aside>;
}
