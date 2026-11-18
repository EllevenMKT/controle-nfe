{
/* ================= utilidades ================= */
const $=s=>document.querySelector(s);
const fmt=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const money=v=>fmt.format(+v||0);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const parseVal=s=>{s=String(s??'').trim().replace(/[R$\s]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=parseFloat(s);return isFinite(n)?Math.round(n*100)/100:NaN};
const toD=s=>{if(!s)return null;const[y,m,d]=String(s).slice(0,10).split('-').map(Number);return new Date(y,m-1,d)};
const today=()=>{const t=new Date();t.setHours(0,0,0,0);return t};
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const br=s=>{const d=toD(s);return d?d.toLocaleDateString('pt-BR'):'—'};
const days=s=>Math.round((toD(s)-today())/864e5);
const uid=()=>crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c=='x'?r:(r&3|8)).toString(16)});
const pl=(n,a,b)=>n==1?a:b;
const ls={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

/* tabelas responsivas: rótulo de cada célula no celular */
new MutationObserver(()=>{for(const c of document.querySelectorAll('.stack td:not([data-l])')){let i=0,p=c;while(p=p.previousElementSibling)i+=p.colSpan;c.dataset.l=c.closest('table').rows[0].cells[i]?.textContent||''}}).observe(document,{childList:true,subtree:true});

const toast=t=>{const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2800)};
const note=t=>{$('#noteBox').innerHTML=t?`<div class="note">${esc(t)}</div>`:''};
const show=v=>{for(const id of ['vLogin','vDenied','vReset','vApp'])$('#'+id).hidden=id!=v};

/* ================= estado ================= */
let NF={},BO={},loaded=false,alertDays=ls.get('nfe.alert',7),filt='abertos',user=null,chan=null;
$('#alertDays').value=alertDays;

/* banco ⇄ app */
const nfFromRow=r=>({numero:r.numero,serie:r.serie||'',emitente:r.emitente,cnpj:r.cnpj||'',emissao:r.emissao||'',valor:+r.valor,chave:r.chave||'',obs:r.obs||''});
const boFromRow=r=>({nfeId:r.nfe_id||'',parcela:r.parcela||'',valor:+r.valor,venc:r.venc,banco:r.banco||'',linha:r.linha||'',pago:!!r.pago,pagoEm:r.pago_em||'',obs:r.obs||''});
const nfToRow=(id,n)=>({id,numero:n.numero,serie:n.serie||null,emitente:n.emitente,cnpj:n.cnpj||null,emissao:n.emissao||null,valor:n.valor,chave:n.chave||null,obs:n.obs||null});
const boToRow=(id,b)=>({id,nfe_id:b.nfeId||null,parcela:b.parcela||null,valor:b.valor,venc:b.venc,banco:b.banco||null,linha:b.linha||null,pago:!!b.pago,pago_em:b.pago?(b.pagoEm||iso(today())):null,obs:b.obs||null});

/* ================= Supabase ================= */
const cfg=window.APP_CONFIG||{};
const configured=cfg.SUPABASE_URL&&!/SEU-PROJETO/.test(cfg.SUPABASE_URL)&&window.supabase;
const sb=configured?window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY):null;
const here=location.origin+location.pathname;

const cacheKey=()=>'nfe.cache.'+(user?.id||'x');
const saveCache=()=>ls.set(cacheKey(),{NF,BO,at:Date.now()});

async function loadAll(){
  try{
    const [n,b]=await Promise.all([sb.from('nfes').select('*'),sb.from('boletos').select('*')]);
    if(n.error||b.error)throw(n.error||b.error);
    NF={};n.data.forEach(r=>NF[r.id]=nfFromRow(r));BO={};b.data.forEach(r=>BO[r.id]=boFromRow(r));
    loaded=true;saveCache();note('');$('#status').textContent='Sincronizado · '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    const c=ls.get(cacheKey(),null);
    if(c){NF=c.NF;BO=c.BO;loaded=true;note(`Sem conexão — mostrando a última cópia salva (${new Date(c.at).toLocaleString('pt-BR')}). Alterações precisam de internet.`)}
    else{loaded=true;note('Não foi possível carregar os dados. Verifique a internet e tente de novo.')}
    $('#status').textContent='Offline';
  }
  render();maybeNotify();
}
let rl;const reloadSoon=()=>{clearTimeout(rl);rl=setTimeout(loadAll,400)};

async function enter(session){
  user=session?.user||null;
  if(!user){if(chan){sb.removeChannel(chan);chan=null}show('vLogin');return}
  $('#who').textContent='Conectado como '+user.email;
  // acesso liberado?
  const m=await sb.from('membros').select('email').limit(1);
  if(!m.error&&!m.data.length){$('#dnEmail').textContent=user.email;show('vDenied');return}
  show('vApp');
  const c=ls.get(cacheKey(),null);if(c&&!loaded){NF=c.NF;BO=c.BO;loaded=true;render()}
  await loadAll();
  if(!chan){chan=sb.channel('mudancas')
    .on('postgres_changes',{event:'*',schema:'public',table:'nfes'},reloadSoon)
    .on('postgres_changes',{event:'*',schema:'public',table:'boletos'},reloadSoon).subscribe()}
}

const fail=e=>{const m=String(e?.message||'');toast(/fetch|network/i.test(m)?'Sem internet — a alteração não foi salva.':/row-level|permission/i.test(m)?'Sua conta não tem permissão para alterar os dados.':'Não foi possível salvar: '+m);throw e};
async function putNf(id,n){const r=await sb.from('nfes').upsert(nfToRow(id,n));if(r.error)fail(r.error);NF[id]=n;saveCache();render()}
async function putBo(id,b){const r=await sb.from('boletos').upsert(boToRow(id,b));if(r.error)fail(r.error);BO[id]=b;saveCache();render()}
async function putBos(list){if(!list.length)return;const r=await sb.from('boletos').insert(list.map(([id,b])=>boToRow(id,b)));if(r.error)fail(r.error);list.forEach(([id,b])=>BO[id]=b);saveCache();render()}
async function delNf(id){const r=await sb.from('nfes').delete().eq('id',id);if(r.error)fail(r.error);delete NF[id];for(const k in BO)if(BO[k].nfeId==id)delete BO[k];saveCache();render()}
async function delBo(id){const r=await sb.from('boletos').delete().eq('id',id);if(r.error)fail(r.error);delete BO[id];saveCache();render()}

/* ================= login ================= */
let signup=false;
const lgMode=()=>{$('#lgTitle').textContent=signup?'Criar conta':'Entrar';$('#lgBtn').textContent=signup?'Criar conta':'Entrar';$('#lgToggle').textContent=signup?'Já tenho conta':'Criar conta';$('#lgPass').autocomplete=signup?'new-password':'current-password';$('#lgMsg').textContent=''};
$('#lgToggle').onclick=()=>{signup=!signup;lgMode()};
$('#lgForm').onsubmit=async e=>{e.preventDefault();const email=$('#lgEmail').value.trim(),password=$('#lgPass').value;$('#lgMsg').textContent='Aguarde…';
  if(signup){const r=await sb.auth.signUp({email,password,options:{emailRedirectTo:here}});
    $('#lgMsg').textContent=r.error?'Erro: '+r.error.message:r.data.session?'':'Conta criada! Abra o link enviado para '+email+' para confirmar.'}
  else{const r=await sb.auth.signInWithPassword({email,password});$('#lgMsg').textContent=r.error?(/Invalid login/i.test(r.error.message)?'E-mail ou senha incorretos.':/not confirmed/i.test(r.error.message)?'Confirme seu e-mail pelo link que enviamos.':'Erro: '+r.error.message):''}};
$('#lgForgot').onclick=async()=>{const email=$('#lgEmail').value.trim();if(!email){$('#lgMsg').textContent='Digite seu e-mail acima e clique de novo.';return}
  const r=await sb.auth.resetPasswordForEmail(email,{redirectTo:here});$('#lgMsg').textContent=r.error?'Erro: '+r.error.message:'Enviamos um link para redefinir a senha.'};
$('#rsForm').onsubmit=async e=>{e.preventDefault();const r=await sb.auth.updateUser({password:$('#rsPass').value});if(r.error){toast('Erro: '+r.error.message);return}toast('Senha alterada');const s=await sb.auth.getSession();enter(s.data.session)};
$('#logout').onclick=$('#dnOut').onclick=async()=>{await sb.auth.signOut();NF={};BO={};loaded=false;show('vLogin')};
$('#dnRetry').onclick=async()=>{const s=await sb.auth.getSession();enter(s.data.session)};

/* ================= situação ================= */
const st=b=>{if(b.pago)return{k:'pago',t:'Pago'+(b.pagoEm?' em '+br(b.pagoEm):'')};const n=days(b.venc);
  if(n<0)return{k:'venc',t:`Vencido há ${-n} ${pl(-n,'dia','dias')}`};if(n==0)return{k:'prox',t:'Vence hoje'};
  if(n<=alertDays)return{k:'prox',t:`Vence em ${n} ${pl(n,'dia','dias')}`};return{k:'aberto',t:`Em aberto · ${n} dias`}};
const nfOf=b=>NF[b.nfeId];
const nfLabel=n=>n?`NF ${esc(n.numero)}${n.serie?'/'+esc(n.serie):''}`:'Sem nota';
const bosOf=id=>Object.entries(BO).filter(([,b])=>b.nfeId==id);
const nfSt=id=>{const n=NF[id],bs=bosOf(id).map(x=>x[1]),soma=bs.reduce((a,b)=>a+(+b.valor||0),0),pagos=bs.filter(b=>b.pago).length;
  let k,t;if(!bs.length){k='aberto';t='Sem boletos'}else if(pagos==bs.length){k='pago';t='Quitada'}
  else if(bs.some(b=>!b.pago&&days(b.venc)<0)){k='venc';t='Com vencido'}else if(pagos){k='prox';t='Parcial'}else{k='aberto';t='Em aberto'}
  return{k,t,soma,pagos,qt:bs.length,dif:Math.round(((+n?.valor||0)-soma)*100)/100}};
const dueList=()=>Object.entries(BO).filter(([,b])=>!b.pago&&b.venc&&days(b.venc)<=alertDays).sort((a,b)=>a[1].venc.localeCompare(b[1].venc));

/* ================= telas ================= */
function render(){renderTop();renderAlerts();renderB();renderN();draw()}

function renderTop(){
  const ab=Object.values(BO).filter(b=>!b.pago&&b.venc),v=ab.filter(b=>days(b.venc)<0),p=ab.filter(b=>{const n=days(b.venc);return n>=0&&n<=alertDays});
  const sum=a=>a.reduce((s,b)=>s+(+b.valor||0),0);const t=today(),mes=Object.values(BO).filter(b=>{const d=toD(b.pagoEm);return b.pago&&d&&d.getMonth()==t.getMonth()&&d.getFullYear()==t.getFullYear()});
  const parts=[];if(v.length)parts.push(`${v.length} ${pl(v.length,'boleto vencido','boletos vencidos')}`);if(p.length)parts.push(`${p.length} ${pl(p.length,'vence','vencem')} nos próximos ${alertDays} dias`);
  $('#finding').textContent=!loaded?'Controle de NF-e e boletos':parts.length?parts.join(' · '):ab.length?'Nenhum boleto vencido ou próximo do vencimento':'Controle de NF-e e boletos';
  const nn=Object.keys(NF).length;
  $('#kpis').innerHTML=[['v','Vencidos',sum(v),`${v.length} ${pl(v.length,'boleto','boletos')}`],['p',`Vencem em até ${alertDays} dias`,sum(p),`${p.length} ${pl(p.length,'boleto','boletos')}`],
    ['','Total em aberto',sum(ab),`${ab.length} ${pl(ab.length,'boleto','boletos')} · ${nn} ${pl(nn,'nota','notas')}`],['','Pago neste mês',sum(mes),`${mes.length} ${pl(mes.length,'boleto','boletos')}`]]
    .map(([c,l,val,s])=>`<div class="k ${c}"><span>${l}</span><b>${money(val)}</b><span>${s}</span></div>`).join('');
}

function boLine(id,b){const n=nfOf(b),s=st(b);return `<div class="ai"><i class="dot ${s.k}"></i><div><strong>${esc(n?.emitente||b.banco||'Boleto')}</strong> <span class="m">· ${nfLabel(n)}${b.parcela?' · parc. '+esc(b.parcela):''} · ${br(b.venc)}</span><br><span class="tag ${s.k}">${s.t}</span></div><div class="num"><strong>${money(b.valor)}</strong></div><div class="rowacts"><button class="sm" data-pay="${id}">Marcar pago</button><button class="sm" data-eb="${id}">Abrir</button></div></div>`}
function renderAlerts(){
  if(!loaded){$('#alerts').innerHTML='<div class="empty">Carregando…</div>';return}
  const l=dueList();
  $('#alerts').innerHTML=l.length?l.map(([id,b])=>boLine(id,b)).join(''):`<div class="empty">${Object.keys(BO).length?`Nada vencido nem vencendo nos próximos ${alertDays} dias.`:'Lance uma nota fiscal e seus boletos para começar a acompanhar os vencimentos.'}</div>`;
  $('#notifBtn').hidden=!('Notification' in window)||Notification.permission!='default';
}

const FILTS=[['abertos','Em aberto'],['venc','Vencidos'],['prox','Próximos'],['pago','Pagos'],['todos','Todos']];
function boFiltered(){const q=$('#qB').value.trim().toLowerCase();
  return Object.entries(BO).filter(([,b])=>{const k=st(b).k;return filt=='todos'||(filt=='abertos'?k!='pago':k==filt)})
    .filter(([,b])=>{if(!q)return true;const n=nfOf(b)||{};return[n.numero,n.emitente,n.cnpj,b.banco,b.linha,b.parcela,b.obs].join(' ').toLowerCase().includes(q)})
    .sort((a,b)=>filt=='pago'?(b[1].pagoEm||'').localeCompare(a[1].pagoEm||''):(a[1].venc||'').localeCompare(b[1].venc||''))}
function renderB(){
  $('#chips').innerHTML=FILTS.map(([k,l])=>`<button class="chip" aria-pressed="${filt==k}" data-f="${k}">${l}</button>`).join('');
  if(!loaded){$('#tblB').innerHTML='<div class="empty">Carregando…</div>';return}
  const l=boFiltered();
  if(!l.length){$('#tblB').innerHTML=`<div class="empty">${Object.keys(BO).length?'Nenhum boleto neste filtro.':'Nenhum boleto lançado ainda.'}</div>`;return}
  const tot=l.reduce((s,[,b])=>s+(+b.valor||0),0);
  $('#tblB').innerHTML=`<table class="stack"><thead><tr><th>Vencimento</th><th>Nota / emitente</th><th>Parcela</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${l.map(([id,b])=>{const n=nfOf(b),s=st(b);
    return `<tr><td style="white-space:nowrap">${br(b.venc)}</td><td><strong>${nfLabel(n)}</strong><br><span class="m">${esc(n?.emitente||b.banco||'')}</span>${b.linha?`<span class="code" style="display:block">${esc(b.linha)}</span>`:''}</td><td>${esc(b.parcela||'')}</td><td class="num">${money(b.valor)}</td><td><span class="tag ${s.k}">${s.t}</span></td>
    <td><div class="rowacts">${b.pago?`<button class="sm" data-unpay="${id}">Desfazer</button>`:`<button class="sm" data-pay="${id}">Pago</button>`}${b.linha?`<button class="sm" data-copy="${id}">Copiar linha</button>`:''}<button class="sm" data-eb="${id}">Editar</button></div></td></tr>`}).join('')}</tbody>
    <tfoot><tr><td colspan="3">${l.length} ${pl(l.length,'boleto','boletos')}</td><td class="num">${money(tot)}</td><td colspan="2"></td></tr></tfoot></table>`;
}

function renderN(){
  if(!loaded){$('#tblN').innerHTML='<div class="empty">Carregando…</div>';return}
  const q=$('#qN').value.trim().toLowerCase();
  const l=Object.entries(NF).filter(([,n])=>!q||[n.numero,n.serie,n.emitente,n.cnpj,n.chave,n.obs].join(' ').toLowerCase().includes(q)).sort((a,b)=>(b[1].emissao||'').localeCompare(a[1].emissao||''));
  if(!l.length){$('#tblN').innerHTML=`<div class="empty">${Object.keys(NF).length?'Nenhuma nota encontrada.':'Nenhuma nota fiscal lançada ainda.'}</div>`;return}
  $('#tblN').innerHTML=`<table class="stack"><thead><tr><th>Nota</th><th>Emitente</th><th>Emissão</th><th class="num">Valor</th><th>Boletos</th><th>Situação</th><th></th></tr></thead><tbody>${l.map(([id,n])=>{const s=nfSt(id);
    return `<tr><td><strong>${nfLabel(n)}</strong>${n.chave?`<span class="code" style="display:block">${esc(n.chave)}</span>`:''}</td><td>${esc(n.emitente)}${n.cnpj?`<br><span class="m">${esc(n.cnpj)}</span>`:''}</td><td>${br(n.emissao)}</td><td class="num">${money(n.valor)}</td>
    <td>${s.pagos}/${s.qt} pagos<br><span class="m">${money(s.soma)}</span>${s.qt&&Math.abs(s.dif)>=.01?`<span class="warn">${s.dif>0?'Faltam':'Excedem'} ${money(Math.abs(s.dif))} em boletos</span>`:''}</td>
    <td><span class="tag ${s.k}">${s.t}</span></td><td><div class="rowacts"><button class="sm" data-nb="${id}">+ Boleto</button><button class="sm" data-en="${id}">Editar</button></div></td></tr>`}).join('')}</tbody></table>`;
}

/* ================= linha do tempo (30 dias) ================= */
const svg=$('#tl');
function draw(){const W=svg.clientWidth,H=svg.clientHeight;if(!W||!H)return;const narrow=W<520,span=30,L=narrow?62:92,R=14,base=H-38;
  const x=n=>L+(W-L-R)*n/span;const ab=Object.entries(BO).filter(([,b])=>!b.pago&&b.venc);const later=ab.filter(([,b])=>days(b.venc)>span).length;
  const slots={};ab.forEach(([id,b])=>{const n=days(b.venc);if(n>span)return;const k=n<0?-1:n;(slots[k]=slots[k]||[]).push([id,b,n])});
  const r=narrow?7:9,step=2*r+4,maxStack=Math.max(1,Math.floor((base-48)/step));
  let o=`<rect x="${x(0)}" y="34" width="${x(Math.min(alertDays,span))-x(0)}" height="${base-34}" fill="var(--brown)" opacity=".1"/>`;
  o+=`<text x="${x(0)+6}" y="26" font-size="13" fill="var(--brown)" font-weight="600">${narrow?'Alerta':'Janela de alerta'} · ${alertDays} d</text>`;
  o+=`<rect x="4" y="34" width="${L-14}" height="${base-34}" rx="8" fill="var(--mag)" opacity=".08"/><text x="${(L-10)/2+4}" y="26" font-size="13" fill="var(--mag)" text-anchor="middle" font-weight="600">Vencidos</text>`;
  for(let y=base-step;y>40;y-=step*2)o+=`<line x1="${x(0)}" x2="${W-R}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="2 5"/>`;
  o+=`<line x1="${x(0)}" x2="${W-R}" y1="${base}" y2="${base}" stroke="var(--ink)" stroke-width="1.5"/>`;
  const t=today(),ev=narrow?10:5;for(let n=0;n<=span;n++){const X=x(n),maj=n%ev==0;o+=`<line x1="${X}" x2="${X}" y1="${base}" y2="${base+(maj?8:4)}" stroke="var(--ink)" opacity="${maj?1:.4}"/>`;
    if(maj){const d=new Date(t);d.setDate(d.getDate()+n);o+=`<text x="${X}" y="${base+24}" font-size="13" text-anchor="${n==span?'end':n==0?'start':'middle'}" fill="var(--ink)" ${n==0?'font-weight="800"':''}>${n==0?'Hoje':d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text>`}}
  Object.entries(slots).forEach(([k,arr])=>{k=+k;const cx=k<0?(L-10)/2+4:x(k);arr.sort((a,b)=>a[2]-b[2]);
    arr.slice(0,maxStack).forEach(([id,b,n],i)=>{const c=n<0?'var(--mag)':n<=alertDays?'var(--brown)':'var(--sea2)';const cy=base-r-4-i*step;const nf=nfOf(b);
      o+=`<g data-eb="${id}" style="cursor:pointer"><title>${esc((nf?.emitente||'Boleto')+(nf?' · NF '+nf.numero:'')+' · '+br(b.venc)+' · '+money(b.valor))}</title><circle cx="${cx}" cy="${cy}" r="${r+3}" fill="var(--bg)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/><circle cx="${cx-r/3}" cy="${cy-r/3}" r="${r/3}" fill="#fff" opacity=".35"/></g>`});
    if(arr.length>maxStack)o+=`<text x="${cx}" y="46" font-size="12" text-anchor="middle" fill="var(--ink)">+${arr.length-maxStack}</text>`});
  if(!ab.length)o+=`<text x="${(x(0)+W-R)/2}" y="${base/2+20}" font-size="15" text-anchor="middle" fill="var(--mute)">${loaded?'Nenhum boleto em aberto':'Carregando…'}</text>`;
  if(later)o+=`<text x="${W-R}" y="${base-8}" font-size="12" text-anchor="end" fill="var(--mute)">+${later} depois de 30 dias</text>`;
  svg.innerHTML=o}
new ResizeObserver(draw).observe(svg);

/* ================= formulários ================= */
const ov=$('#ov'),dlg=$('#dlg');
const open=h=>{dlg.innerHTML=h;ov.classList.add('on');setTimeout(()=>dlg.querySelector('input,select')?.focus(),30)};
const close=()=>ov.classList.remove('on');
ov.addEventListener('click',e=>{if(e.target==ov)close()});document.addEventListener('keydown',e=>{if(e.key=='Escape')close()});
const v=id=>dlg.querySelector('#'+id)?.value.trim()||'';
const busy=(on)=>{const b=dlg.querySelector('button.pri');if(b){b.disabled=on;b.textContent=on?'Salvando…':'Salvar'}};

function nfForm(id){const n=id?NF[id]:{emissao:iso(today())};const d1=new Date(today());d1.setDate(d1.getDate()+30);
  open(`<h2>${id?'Editar nota fiscal':'Nova nota fiscal'}</h2><form id="f"><div class="g">
  <label>Número *<input id="numero" required value="${esc(n.numero)}" inputmode="numeric"></label><label>Série<input id="serie" value="${esc(n.serie)}"></label>
  <label class="w">Emitente / fornecedor *<input id="emitente" required value="${esc(n.emitente)}"></label>
  <label>CNPJ<input id="cnpj" value="${esc(n.cnpj)}" inputmode="numeric"></label><label>Data de emissão<input id="emissao" type="date" value="${esc(n.emissao)}"></label>
  <label>Valor total *<input id="valor" required inputmode="decimal" placeholder="0,00" value="${n.valor!=null?String(n.valor).replace('.',','):''}"></label>
  <label class="w">Chave de acesso<input id="chave" maxlength="54" inputmode="numeric" value="${esc(n.chave)}" placeholder="44 dígitos"></label>
  <label class="w">Observações<textarea id="obs" rows="2">${esc(n.obs)}</textarea></label>
  ${id?'':`<fieldset class="w"><legend>Gerar boletos desta nota</legend><label class="ck" style="margin-bottom:10px"><input type="checkbox" id="gen" checked> Criar boletos automaticamente</label>
  <div class="g" style="margin:0"><label>Parcelas<input id="parc" type="number" min="1" max="60" value="1"></label><label>Intervalo (dias)<input id="intv" type="number" min="1" value="30"></label>
  <label class="w">1º vencimento<input id="v1" type="date" value="${iso(d1)}"></label></div></fieldset>`}
  </div><div class="foot">${id?`<button type="button" class="dng" id="delNfB">Excluir</button>`:''}<button type="button" id="cancel">Cancelar</button><button class="pri">Salvar</button></div></form>`);
  $('#cancel').onclick=close;
  if(id)$('#delNfB').onclick=()=>{const q=bosOf(id).length;confirmDlg(`Excluir ${nfLabel(n)}${q?` e ${q} ${pl(q,'boleto vinculado','boletos vinculados')}`:''}?`,async()=>{await delNf(id);toast('Nota excluída')})};
  $('#f').onsubmit=async e=>{e.preventDefault();const val=parseVal(v('valor'));if(isNaN(val)){toast('Valor inválido');return}
    const chave=v('chave').replace(/\D/g,'');if(chave&&chave.length!=44){toast('A chave de acesso deve ter 44 dígitos');return}
    const nid=id||uid();const obj={numero:v('numero'),serie:v('serie'),emitente:v('emitente'),cnpj:v('cnpj'),emissao:v('emissao'),valor:val,chave,obs:v('obs')};
    busy(true);
    try{await putNf(nid,obj);
      if(!id&&dlg.querySelector('#gen')?.checked&&v('v1')){const p=Math.max(1,Math.min(60,+v('parc')||1)),iv=+v('intv')||30,c=Math.round(val*100),base=Math.floor(c/p),list=[];
        for(let i=0;i<p;i++){const d=toD(v('v1'));d.setDate(d.getDate()+iv*i);const cents=i==p-1?c-base*(p-1):base;
          list.push([uid(),{nfeId:nid,parcela:p>1?`${i+1}/${p}`:'',valor:cents/100,venc:iso(d),banco:'',linha:'',pago:false,pagoEm:'',obs:''}])}
        await putBos(list)}
      close();toast(id?'Nota atualizada':'Nota lançada')}catch(e){busy(false)}};
}

function boForm(id,nfeId){const b=id?BO[id]:{nfeId:nfeId||'',venc:'',pago:false};
  const opts=Object.entries(NF).sort((a,c)=>(c[1].emissao||'').localeCompare(a[1].emissao||'')).map(([k,n])=>`<option value="${k}" ${k==b.nfeId?'selected':''}>${nfLabel(n)} — ${esc(n.emitente)}</option>`).join('');
  open(`<h2>${id?'Editar boleto':'Novo boleto'}</h2><form id="f"><div class="g">
  <label class="w">Nota fiscal vinculada<select id="nfeId"><option value="">— sem nota —</option>${opts}</select></label>
  <label>Valor *<input id="valor" required inputmode="decimal" placeholder="0,00" value="${b.valor!=null?String(b.valor).replace('.',','):''}"></label>
  <label>Vencimento *<input id="venc" type="date" required value="${esc(b.venc)}"></label>
  <label>Parcela<input id="parcela" placeholder="ex.: 1/3" value="${esc(b.parcela)}"></label><label>Banco / beneficiário<input id="banco" value="${esc(b.banco)}"></label>
  <label class="w">Linha digitável<input id="linha" inputmode="numeric" value="${esc(b.linha)}"></label>
  <label class="ck w"><input type="checkbox" id="pago" ${b.pago?'checked':''}> Pago</label>
  <label>Data do pagamento<input id="pagoEm" type="date" value="${esc(b.pagoEm)}"></label><span></span>
  <label class="w">Observações<textarea id="obs" rows="2">${esc(b.obs)}</textarea></label>
  </div><div class="foot">${id?`<button type="button" class="dng" id="delBoB">Excluir</button>`:''}<button type="button" id="cancel">Cancelar</button><button class="pri">Salvar</button></div></form>`);
  $('#cancel').onclick=close;
  $('#pago').onchange=e=>{if(e.target.checked&&!v('pagoEm'))$('#pagoEm').value=iso(today())};
  if(id)$('#delBoB').onclick=()=>confirmDlg('Excluir este boleto?',async()=>{await delBo(id);toast('Boleto excluído')});
  $('#f').onsubmit=async e=>{e.preventDefault();const val=parseVal(v('valor'));if(isNaN(val)){toast('Valor inválido');return}
    const pago=$('#pago').checked;const obj={nfeId:v('nfeId'),valor:val,venc:v('venc'),parcela:v('parcela'),banco:v('banco'),linha:v('linha'),pago,pagoEm:pago?(v('pagoEm')||iso(today())):'',obs:v('obs')};
    busy(true);try{await putBo(id||uid(),obj);close();toast(id?'Boleto atualizado':'Boleto lançado')}catch(e){busy(false)}};
}

function confirmDlg(msg,fn){open(`<h2>${esc(msg)}</h2><p class="sub">Esta ação não pode ser desfeita.</p><div class="foot" style="margin-top:18px"><button id="no">Cancelar</button><button class="pri" id="yes" style="background:var(--mag);border-color:var(--mag)">Excluir</button></div>`);
  $('#no').onclick=close;$('#yes').onclick=async()=>{try{await fn();close()}catch(e){}}}

async function setPaid(id,p){const b=BO[id];if(!b)return;try{await putBo(id,{...b,pago:p,pagoEm:p?iso(today()):''});toast(p?'Boleto marcado como pago':'Pagamento desfeito')}catch(e){}}

/* ================= notificações e instalação ================= */
async function maybeNotify(){
  if(!('Notification' in window)||Notification.permission!='granted')return;
  const l=dueList();if(!l.length)return;const k=iso(today());if(ls.get('nfe.notified','')==k)return;
  const v=l.filter(([,b])=>days(b.venc)<0).length,p=l.length-v;
  const body=[v?`${v} ${pl(v,'boleto vencido','boletos vencidos')}`:'',p?`${p} ${pl(p,'vence','vencem')} em até ${alertDays} dias`:''].filter(Boolean).join(' · ');
  try{const reg=await navigator.serviceWorker?.ready;if(reg)reg.showNotification('Boletos precisam de atenção',{body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',tag:'nfe-alertas'});else new Notification('Boletos precisam de atenção',{body});ls.set('nfe.notified',k)}catch(e){}
}
$('#notifBtn').onclick=async()=>{try{const r=await Notification.requestPermission();renderAlerts();if(r=='granted'){toast('Notificações ativadas');maybeNotify()}}catch(e){}};

let installEvt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;$('#install').hidden=false});
$('#install').onclick=async()=>{if(!installEvt)return;installEvt.prompt();await installEvt.userChoice;installEvt=null;$('#install').hidden=true};
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});

/* ================= eventos ================= */
document.addEventListener('click',async e=>{const t=e.target.closest('[data-pay],[data-unpay],[data-eb],[data-en],[data-nb],[data-copy],[data-f]');if(!t)return;const d=t.dataset;
  if(d.pay)setPaid(d.pay,true);else if(d.unpay)setPaid(d.unpay,false);else if(d.eb)boForm(d.eb);else if(d.en)nfForm(d.en);else if(d.nb)boForm(null,d.nb);
  else if(d.f){filt=d.f;renderB()}
  else if(d.copy){try{await navigator.clipboard.writeText(BO[d.copy].linha);toast('Linha digitável copiada')}catch(x){toast('Não foi possível copiar')}}});
$('#addNf').onclick=()=>nfForm();
$('#addBo').onclick=()=>boForm();
$('#qB').oninput=renderB;$('#qN').oninput=renderN;
$('#alertDays').onchange=e=>{alertDays=Math.max(1,Math.min(60,+e.target.value||7));e.target.value=alertDays;ls.set('nfe.alert',alertDays);ls.set('nfe.notified','');render()};
const setTab=k=>{$('#tabB').setAttribute('aria-selected',k=='B');$('#tabN').setAttribute('aria-selected',k=='N');$('#paneB').hidden=k!='B';$('#paneN').hidden=k!='N'};
$('#tabB').onclick=()=>setTab('B');$('#tabN').onclick=()=>setTab('N');
$('#csv').onclick=()=>{const rows=[['Vencimento','Nota','Serie','Emitente','CNPJ','Parcela','Valor','Situacao','Pago em','Banco','Linha digitavel']];
  Object.values(BO).sort((a,b)=>(a.venc||'').localeCompare(b.venc||'')).forEach(b=>{const n=nfOf(b)||{};rows.push([br(b.venc),n.numero,n.serie,n.emitente,n.cnpj,b.parcela,String(b.valor).replace('.',','),st(b).t,b.pagoEm?br(b.pagoEm):'',b.banco,b.linha])});
  const csv='﻿'+rows.map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=`boletos-${iso(today())}.csv`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)};
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user&&loaded)reloadSoon()});
setInterval(()=>{if(loaded)render()},60*60*1000);

/* ================= início ================= */
if(!sb){show('vLogin');$('#lgForm').hidden=true;$('#lgToggle').hidden=$('#lgForgot').hidden=true;$('#lgMsg').textContent='App ainda não configurado: preencha o arquivo config.js com os dados do Supabase.'}
else{
  sb.auth.onAuthStateChange((ev,session)=>{if(ev=='PASSWORD_RECOVERY'){show('vReset');return}if(ev=='SIGNED_IN'||ev=='SIGNED_OUT'||ev=='INITIAL_SESSION')setTimeout(()=>enter(session),0)});
}
}
