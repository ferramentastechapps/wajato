'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Send, Plus, Trash2, Play, Pause, X, StopCircle,
  AlertCircle, Clock, Eye, Calendar, Smartphone,
  Shuffle, RefreshCw, Coffee, Shield, MessageSquarePlus
} from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';

interface Campaign {
  id: string;
  name: string;
  status: 'DRAFT' | 'QUEUED' | 'SENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
  delayMin: number;
  delayMax: number;
  batchSize?: number;
  batchCooldown?: number;
  messageVariants?: string[];
  groupId?: string | null;
  segmentId?: string | null;
  group?: { id: string; name: string } | null;
  segment?: { id: string; name: string } | null;
  template: { id: string; name: string };
  stats: { total: number; sent: number; delivered: number; read: number; failed: number; pending: number; };
  createdAt: string;
  scheduledAt?: string | null;
}
interface Group { id: string; name: string; _count?: { contacts: number }; }
interface Template { id: string; name: string; body: string; imageUrl?: string | null; }

const DELAY_PRESETS = [
  { id: 'safe',   label: '\u{1F6E1}\uFE0F Muito Seguro', min: 45, max: 120 },
  { id: 'medium', label: '\u2696\uFE0F Balanceado',      min: 20, max: 60  },
  { id: 'fast',   label: '\u26A1 R\u00E1pido',           min: 8,  max: 20  },
  { id: 'custom', label: '\u2699\uFE0F Manual',           min: 20, max: 60  },
];

const BATCH_PRESETS = [
  { label: 'Desativado',               size: 0,  cooldown: 0   },
  { label: 'A cada 20 msgs \u2192 10min', size: 20, cooldown: 600 },
  { label: 'A cada 30 msgs \u2192 12min', size: 30, cooldown: 720 },
  { label: 'A cada 50 msgs \u2192 15min', size: 50, cooldown: 900 },
];

function parseSpintax(text: string): string {
  let result = text;
  const pattern = /\{([^{}]+)\}/;
  let match: RegExpExecArray | null;
  let safety = 0;
  while ((match = pattern.exec(result)) !== null && safety++ < 100) {
    const options = match[1].split('|');
    result = result.replace(match[0], options[Math.floor(Math.random() * options.length)]);
  }
  return result;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddCampaign, setShowAddCampaign] = useState(false);

  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<'GROUP' | 'SEGMENT'>('GROUP');
  const [groupId, setGroupId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [delayMin, setDelayMin] = useState(20);
  const [delayMax, setDelayMax] = useState(60);
  const [delayPreset, setDelayPreset] = useState<string>('medium');
  const [errorMsg, setErrorMsg] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [messageVariants, setMessageVariants] = useState<string[]>([]);
  const [batchSize, setBatchSize] = useState(0);
  const [batchCooldown, setBatchCooldown] = useState(600);
  const [batchPresetIdx, setBatchPresetIdx] = useState(0);
  const [previewVariantIdx, setPreviewVariantIdx] = useState(0);
  const [previewText, setPreviewText] = useState('');

  const fetchCampaigns = async () => {
    setLoading(true);
    try { const r = await fetch('/api/campaigns'); if (r.ok) setCampaigns((await r.json()).campaigns || []); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchData = async () => {
    try {
      const [cr, tr, sr] = await Promise.all([fetch('/api/contacts'), fetch('/api/templates'), fetch('/api/contacts/segments')]);
      if (cr.ok) setGroups((await cr.json()).groups || []);
      if (tr.ok) setTemplates((await tr.json()).templates || []);
      if (sr.ok) setSegments((await sr.json()).segments || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchCampaigns(); fetchData(); }, []);

  const allVariants = useCallback((): string[] => {
    const sel = templates.find(t => t.id === templateId);
    if (!sel) return [];
    return [sel.body, ...messageVariants];
  }, [templates, templateId, messageVariants]);

  const regeneratePreview = useCallback(() => {
    const variants = allVariants();
    if (variants.length === 0) { setPreviewText(''); return; }
    const idx = previewVariantIdx % variants.length;
    const raw = variants[idx].replace(/{{nome}}/g, 'Jo\u00E3o Silva').replace(/{{link}}/g, 'https://wa.me/grupopromo');
    setPreviewText(parseSpintax(raw));
  }, [allVariants, previewVariantIdx]);

  useEffect(() => { regeneratePreview(); }, [templateId, previewVariantIdx, messageVariants, regeneratePreview]);

  const getRisk = () => {
    let s = 0;
    if (delayMin < 10) s += 3; else if (delayMin < 20) s += 1;
    if (delayMax < 30) s += 2;
    if (batchSize === 0) s += 1;
    return Math.min(s, 5);
  };
  const risk = getRisk();
  const riskColor = risk <= 1 ? '#10b981' : risk <= 3 ? '#f59e0b' : '#ef4444';
  const riskLabel = risk <= 1 ? 'Muito Seguro' : risk <= 2 ? 'Seguro' : risk <= 3 ? 'Moderado' : risk <= 4 ? 'Arriscado' : 'Perigoso';

  const handleOpenModal = () => {
    setName(''); setTargetType('GROUP');
    setGroupId(groups[0]?.id || ''); setSegmentId(segments[0]?.id || '');
    setTemplateId(templates[0]?.id || '');
    setDelayMin(20); setDelayMax(60); setDelayPreset('medium');
    setMessageVariants([]); setBatchSize(0); setBatchCooldown(600); setBatchPresetIdx(0);
    setIsScheduled(false); setScheduledAt(''); setPreviewVariantIdx(0); setErrorMsg('');
    setShowAddCampaign(true);
  };

  const handleAddVariant = () => setMessageVariants(p => [...p, '']);
  const handleVariantChange = (i: number, v: string) => setMessageVariants(p => p.map((x, j) => j === i ? v : x));
  const handleRemoveVariant = (i: number) => { setMessageVariants(p => p.filter((_, j) => j !== i)); setPreviewVariantIdx(0); };
  const handlePresetChange = (p: typeof DELAY_PRESETS[0]) => { setDelayPreset(p.id); if (p.id !== 'custom') { setDelayMin(p.min); setDelayMax(p.max); } };
  const handleBatchPreset = (i: number) => { setBatchPresetIdx(i); setBatchSize(BATCH_PRESETS[i].size); setBatchCooldown(BATCH_PRESETS[i].cooldown); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg('');
    const targetId = targetType === 'GROUP' ? groupId : segmentId;
    if (!name || !targetId || !templateId) { setErrorMsg('Todos os campos marcados s\u00E3o obrigat\u00F3rios'); return; }
    if (isScheduled && !scheduledAt) { setErrorMsg('Selecione data e hora.'); return; }
    if (delayMin < 5) { setErrorMsg('Delay m\u00EDnimo: 5 segundos.'); return; }
    if (delayMax <= delayMin) { setErrorMsg('Delay m\u00E1ximo deve ser maior que o m\u00EDnimo.'); return; }
    const cleanVariants = messageVariants.filter(v => v.trim().length > 0);
    setIsSubmitting(true);
    try {
      const r = await fetch('/api/campaigns', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, groupId: targetType === 'GROUP' ? groupId : null, segmentId: targetType === 'SEGMENT' ? segmentId : null, templateId, delayMin, delayMax, messageVariants: cleanVariants, batchSize, batchCooldown, scheduledAt: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null }),
      });
      if (r.ok) { setShowAddCampaign(false); fetchCampaigns(); }
      else setErrorMsg((await r.json()).message || 'Erro ao criar campanha.');
    } catch { setErrorMsg('Erro de conex\u00E3o.'); }
    finally { setIsSubmitting(false); }
  };

  const handleAction = async (id: string, action: 'START' | 'PAUSE' | 'CANCEL') => {
    try {
      const r = await fetch(`/api/campaigns/${id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!r.ok) alert((await r.json()).message || 'Erro.'); fetchCampaigns();
    } catch { alert('Erro de conex\u00E3o.'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta campanha?')) return;
    try { await fetch(`/api/campaigns/${id}`, { method: 'DELETE' }); fetchCampaigns(); } catch { /**/ }
  };

  const badge = (status: string, sch?: string | null) => {
    if (status === 'DRAFT') return sch ? <span className="badge" style={{backgroundColor:'#6366f1',color:'#fff',borderColor:'#6366f1'}}>Agendada</span> : <span className="badge badge-info">Rascunho</span>;
    if (status === 'QUEUED') return <span className="badge badge-warning">Na Fila</span>;
    if (status === 'SENDING') return <span className="badge badge-success pulse-glow">Enviando</span>;
    if (status === 'PAUSED') return <span className="badge badge-warning">Pausada</span>;
    if (status === 'COMPLETED') return <span className="badge badge-success">Conclu\u00EDda</span>;
    if (status === 'CANCELLED') return <span className="badge badge-error">Cancelada</span>;
    return <span className="badge badge-info">{status}</span>;
  };

  const selGroup = groups.find(g => g.id === groupId);
  const contactsCount = targetType === 'GROUP' && selGroup ? selGroup._count?.contacts || 0 : 0;
  const fmt = (sec: number) => { if (sec < 60) return `${sec}s`; const m = Math.floor(sec/60); if (m < 60) return `${m}min`; return `${Math.floor(m/60)}h${m%60>0?` ${m%60}min`:''}`; };
  const timeEst = () => {
    if (contactsCount <= 0) return null;
    const avg = (delayMin + delayMax) / 2;
    let tot = contactsCount * avg;
    if (batchSize > 0) tot += Math.floor(contactsCount / batchSize) * batchCooldown;
    return { min: fmt(contactsCount * delayMin), max: fmt(Math.round(tot + contactsCount * (delayMax - avg))) };
  };
  const est = timeEst();
  const vars = allVariants();

  return (
    <AppLayout title="Campanhas">
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'1.5rem'}}>
        <button onClick={handleOpenModal} className="btn btn-primary"><Plus size={16}/> Nova Campanha</button>
      </div>

      {loading ? (
        <div className="card-glass" style={{padding:'4rem',textAlign:'center',color:'#9ca3af'}}>
          <div style={{width:'32px',height:'32px',border:'3px solid rgba(37,211,102,0.1)',borderTopColor:'#25d366',borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 1rem'}}/>
          <span>Carregando campanhas...</span>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="card-glass" style={{padding:'4rem',textAlign:'center',color:'#6b7280'}}>
          <Send size={48} style={{marginBottom:'1rem',strokeWidth:1.5}}/>
          <p>Nenhuma campanha criada ainda.</p>
          <button onClick={handleOpenModal} className="btn btn-primary" style={{marginTop:'1rem'}}>Criar Primeira Campanha</button>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:'1.5rem'}}>
          {campaigns.map(camp => {
            const pct = camp.stats.total > 0 ? (camp.stats.sent / camp.stats.total) * 100 : 0;
            return (
              <div key={camp.id} className="card-glass" style={{padding:'1.5rem 2rem'}}>
                <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:'1rem',borderBottom:'1px solid var(--border)',paddingBottom:'1rem',marginBottom:'1rem'}}>
                  <div>
                    <h3 style={{fontSize:'1.25rem',marginBottom:'0.25rem'}}>{camp.name}</h3>
                    <div style={{display:'flex',gap:'1.25rem',flexWrap:'wrap',fontSize:'0.75rem',color:'#9ca3af',alignItems:'center'}}>
                      <span>Template: <strong>{camp.template.name}</strong></span>
                      {camp.group ? <span>Grupo: <strong>{camp.group.name}</strong></span> : camp.segment ? <span>Segmento: <strong>{camp.segment.name}</strong></span> : null}
                      <span style={{display:'flex',alignItems:'center',gap:'0.25rem'}}><Clock size={12}/>{camp.delayMin}s\u2013{camp.delayMax}s</span>
                      {(camp.batchSize??0)>0 && <span style={{display:'flex',alignItems:'center',gap:'0.25rem',color:'#a78bfa'}}><Coffee size={12}/>Pausa a cada {camp.batchSize} msgs</span>}
                      {(camp.messageVariants?.length??0)>0 && <span style={{display:'flex',alignItems:'center',gap:'0.25rem',color:'#34d399'}}><Shuffle size={12}/>{(camp.messageVariants?.length??0)+1} variantes</span>}
                      {camp.scheduledAt && <span style={{display:'flex',alignItems:'center',gap:'0.3rem',color:'#818cf8',fontWeight:600}}><Calendar size={12}/>{new Date(camp.scheduledAt).toLocaleString('pt-BR')}</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
                    {badge(camp.status, camp.scheduledAt)}
                    <div style={{display:'flex',gap:'0.5rem',borderLeft:'1px solid var(--border)',paddingLeft:'1rem'}}>
                      {camp.status!=='SENDING'&&camp.status!=='COMPLETED'&&<button onClick={()=>handleAction(camp.id,'START')} className="btn btn-primary" style={{padding:'0.375rem 0.75rem',fontSize:'0.75rem'}}><Play size={12}/> Disparar</button>}
                      {camp.status==='SENDING'&&<button onClick={()=>handleAction(camp.id,'PAUSE')} className="btn btn-secondary" style={{padding:'0.375rem 0.75rem',fontSize:'0.75rem',backgroundColor:'#d97706',color:'#fff',borderColor:'#d97706'}}><Pause size={12}/> Pausar</button>}
                      {(camp.status==='SENDING'||camp.status==='PAUSED')&&<button onClick={()=>handleAction(camp.id,'CANCEL')} className="btn btn-danger" style={{padding:'0.375rem 0.75rem',fontSize:'0.75rem'}}><StopCircle size={12}/> Cancelar</button>}
                      <Link href={`/campaigns/${camp.id}`} className="btn btn-secondary" style={{padding:'0.375rem 0.75rem',fontSize:'0.75rem'}}><Eye size={12}/> Detalhes</Link>
                      <button onClick={()=>handleDelete(camp.id)} className="btn btn-secondary" style={{padding:'0.375rem',color:'#ef4444'}} disabled={camp.status==='SENDING'}><Trash2 size={12}/></button>
                    </div>
                  </div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:'1rem',marginBottom:'1rem'}}>
                  {[{l:'Total',v:camp.stats.total,c:'#9ca3af'},{l:'Enviadas',v:camp.stats.sent,c:'#25d366'},{l:'Entregues',v:camp.stats.delivered,c:'#3b82f6'},{l:'Lidas',v:camp.stats.read,c:'#10b981'},{l:'Falhas',v:camp.stats.failed,c:'#ef4444'}].map(s=>(
                    <div key={s.l} style={{textAlign:'center',padding:'0.5rem',backgroundColor:'rgba(255,255,255,0.01)',borderRadius:'8px'}}>
                      <span style={{fontSize:'0.75rem',color:s.c}}>{s.l}</span>
                      <p style={{fontSize:'1.25rem',fontWeight:700,marginTop:'0.25rem',color:s.c}}>{s.v}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.75rem',color:'#9ca3af',marginBottom:'0.25rem'}}>
                    <span>Progresso</span><span>{camp.stats.sent}/{camp.stats.total} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div className="progress-container" style={{height:'10px'}}>
                    <div className={`progress-bar ${camp.status==='SENDING'?'progress-bar-animated':''}`} style={{width:`${pct}%`}}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddCampaign && (
        <div className="modal-overlay" style={{zIndex:1000}}>
          <div className="modal-content" style={{maxWidth:'960px',width:'100%',animation:'modalIn 0.22s cubic-bezier(0.16,1,0.3,1)'}}>
            <div className="modal-header">
              <h3 className="modal-title" style={{fontSize:'1.15rem',fontWeight:700}}>\uD83D\uDE80 Configurar Campanha de Disparos</h3>
              <X className="modal-close" onClick={()=>setShowAddCampaign(false)}/>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{display:'grid',gridTemplateColumns:'minmax(320px,1fr) minmax(280px,400px)',gap:'2rem',padding:'1.5rem',alignItems:'start'}}>

                {/* COLUNA 1 */}
                <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                  {errorMsg && <div style={{display:'flex',alignItems:'center',gap:'0.5rem',backgroundColor:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',color:'#ef4444',padding:'0.75rem',borderRadius:'8px',fontSize:'0.8125rem'}}><AlertCircle size={16}/><span>{errorMsg}</span></div>}

                  <div className="form-group">
                    <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0'}}>Nome da Campanha *</label>
                    <input type="text" className="input-control" placeholder="Ex: Promo\u00E7\u00E3o Domingo" value={name} onChange={e=>setName(e.target.value)} required/>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0'}}>Destinat\u00E1rios *</label>
                    <div style={{display:'flex',gap:'1.25rem',marginBottom:'0.5rem'}}>
                      {(['GROUP','SEGMENT'] as const).map(t=>(
                        <label key={t} style={{display:'flex',alignItems:'center',gap:'0.35rem',fontSize:'0.82rem',cursor:'pointer',color:'#94a3b8'}}>
                          <input type="radio" name="targetType" value={t} checked={targetType===t} onChange={()=>{setTargetType(t);if(t==='GROUP'){setGroupId(groups[0]?.id||'');setSegmentId('');}else{setSegmentId(segments[0]?.id||'');setGroupId('');}}}/>
                          {t==='GROUP'?'Grupo Est\u00E1tico':'Segmenta\u00E7\u00E3o Din\u00E2mica'}
                        </label>
                      ))}
                    </div>
                    {targetType==='GROUP'?(
                      <select className="input-control" value={groupId} onChange={e=>setGroupId(e.target.value)} required>
                        {groups.length===0?<option value="">Crie um grupo primeiro!</option>:groups.map(g=><option key={g.id} value={g.id}>{g.name} ({g._count?.contacts||0} contatos)</option>)}
                      </select>
                    ):(
                      <select className="input-control" value={segmentId} onChange={e=>setSegmentId(e.target.value)} required>
                        {segments.length===0?<option value="">Crie uma segmenta\u00E7\u00E3o primeiro!</option>:segments.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0'}}>Mensagem Base (Template) *</label>
                    <select className="input-control" value={templateId} onChange={e=>{setTemplateId(e.target.value);setPreviewVariantIdx(0);}} required>
                      {templates.length===0?<option value="">Crie um template primeiro!</option>:templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  {/* VARIANTES */}
                  <div style={{background:'rgba(52,211,153,0.04)',border:'1px solid rgba(52,211,153,0.15)',borderRadius:'10px',padding:'1rem'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.65rem'}}>
                      <div>
                        <div style={{fontSize:'0.82rem',fontWeight:700,color:'#34d399',display:'flex',alignItems:'center',gap:'0.4rem'}}>
                          <Shuffle size={14}/> Varia\u00E7\u00F5es de Mensagem
                        </div>
                        <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.35)',marginTop:'2px'}}>
                          Sistema rotaciona aleatoriamente \u2014 cada pessoa recebe um texto diferente
                        </div>
                      </div>
                      <button type="button" onClick={handleAddVariant} className="btn btn-secondary" style={{padding:'0.3rem 0.6rem',fontSize:'0.7rem',borderColor:'rgba(52,211,153,0.3)',color:'#34d399',flexShrink:0}}>
                        <MessageSquarePlus size={13}/> + Adicionar Texto
                      </button>
                    </div>
                    {messageVariants.length===0?(
                      <div style={{textAlign:'center',padding:'0.75rem',color:'rgba(255,255,255,0.22)',fontSize:'0.73rem',border:'1px dashed rgba(255,255,255,0.08)',borderRadius:'8px'}}>
                        Sem variantes \u2014 usando apenas a mensagem base do template
                      </div>
                    ):(
                      <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                        {messageVariants.map((v,i)=>(
                          <div key={i} style={{animation:'wa-fadeUp 0.15s ease'}}>
                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.25rem'}}>
                              <span style={{fontSize:'0.68rem',color:'#34d399',fontWeight:600}}>Variante {i+2}</span>
                              <button type="button" onClick={()=>handleRemoveVariant(i)} style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',padding:'2px',opacity:0.7}}><X size={13}/></button>
                            </div>
                            <textarea className="input-control" placeholder={`Texto alternativo ${i+2}...\n\nUse {{nome}} e {{link}}`} value={v} onChange={e=>{handleVariantChange(i,e.target.value);setPreviewVariantIdx(i+1);}} onFocus={()=>setPreviewVariantIdx(i+1)} style={{minHeight:'80px',fontSize:'0.78rem',resize:'vertical'}}/>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* DELAY */}
                  <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:'10px',padding:'1rem'}}>
                    <div style={{fontSize:'0.82rem',fontWeight:700,color:'#e2e8f0',marginBottom:'0.6rem',display:'flex',alignItems:'center',gap:'0.4rem'}}>
                      <Clock size={14}/> Intervalo entre Mensagens
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.35rem',marginBottom:'0.75rem'}}>
                      {DELAY_PRESETS.map(p=>(
                        <button key={p.id} type="button" onClick={()=>handlePresetChange(p)} className={`btn ${delayPreset===p.id?'btn-primary':'btn-secondary'}`} style={{padding:'0.35rem 0',fontSize:'0.62rem',fontWeight:600}}>{p.label}</button>
                      ))}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.75rem'}}>
                      <div>
                        <label style={{fontSize:'0.68rem',color:'#94a3b8',display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}><span>M\u00EDnimo</span><strong style={{color:'#e2e8f0'}}>{delayMin}s</strong></label>
                        <input type="range" min={5} max={120} step={1} value={delayMin} onChange={e=>{const v=parseInt(e.target.value);setDelayMin(v);if(v>=delayMax)setDelayMax(v+5);setDelayPreset('custom');}} style={{width:'100%',accentColor:'#25d366'}}/>
                      </div>
                      <div>
                        <label style={{fontSize:'0.68rem',color:'#94a3b8',display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}><span>M\u00E1ximo</span><strong style={{color:'#e2e8f0'}}>{delayMax}s</strong></label>
                        <input type="range" min={6} max={180} step={1} value={delayMax} onChange={e=>{const v=parseInt(e.target.value);setDelayMax(v);if(v<=delayMin)setDelayMin(v-5);setDelayPreset('custom');}} style={{width:'100%',accentColor:'#25d366'}}/>
                      </div>
                    </div>
                    <div style={{marginTop:'0.75rem',display:'flex',alignItems:'center',gap:'0.6rem'}}>
                      <Shield size={13} style={{color:riskColor,flexShrink:0}}/>
                      <div style={{flex:1,background:'rgba(255,255,255,0.06)',borderRadius:'99px',height:'6px',overflow:'hidden'}}>
                        <div style={{height:'100%',width:`${(risk/5)*100}%`,background:riskColor,borderRadius:'99px',transition:'width 0.3s,background 0.3s'}}/>
                      </div>
                      <span style={{fontSize:'0.68rem',color:riskColor,fontWeight:700,minWidth:'80px'}}>{riskLabel}</span>
                    </div>
                  </div>

                  {/* BATCH COOLDOWN */}
                  <div style={{background:'rgba(167,139,250,0.04)',border:'1px solid rgba(167,139,250,0.15)',borderRadius:'10px',padding:'1rem'}}>
                    <div style={{fontSize:'0.82rem',fontWeight:700,color:'#a78bfa',marginBottom:'0.4rem',display:'flex',alignItems:'center',gap:'0.4rem'}}>
                      <Coffee size={14}/> Pausa de Seguran\u00E7a entre Lotes
                    </div>
                    <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.35)',marginBottom:'0.65rem'}}>
                      A cada N mensagens o sistema para automaticamente por alguns minutos \u2014 imita comportamento humano
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.35rem'}}>
                      {BATCH_PRESETS.map((p,i)=>(
                        <button key={i} type="button" onClick={()=>handleBatchPreset(i)} className={`btn ${batchPresetIdx===i?'btn-primary':'btn-secondary'}`} style={{padding:'0.4rem 0.5rem',fontSize:'0.65rem',fontWeight:600,borderColor:batchPresetIdx===i?'':'rgba(167,139,250,0.2)'}}>{p.label}</button>
                      ))}
                    </div>
                  </div>

                  {/* AGENDAMENTO */}
                  <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:'10px',padding:'0.75rem 1rem'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.82rem',fontWeight:600,color:'#e2e8f0'}}>
                      <input type="checkbox" checked={isScheduled} onChange={e=>{setIsScheduled(e.target.checked);if(e.target.checked&&!scheduledAt){const d=new Date();d.setDate(d.getDate()+1);setScheduledAt(d.toISOString().slice(0,16));}}}/>
                      \uD83D\uDCC5 Agendar envio para depois
                    </label>
                    {isScheduled&&(
                      <div style={{marginTop:'0.65rem',animation:'wa-fadeUp 0.15s ease'}}>
                        <input type="datetime-local" className="input-control" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0,16)} style={{fontSize:'0.78rem'}}/>
                        <span style={{fontSize:'0.63rem',color:'rgba(255,255,255,0.3)',marginTop:4,display:'block'}}>A campanha ficar\u00E1 na fila e disparar\u00E1 automaticamente.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* COLUNA 2: PREVIEW */}
                <div style={{display:'flex',flexDirection:'column',background:'#0b141a',borderRadius:'12px',border:'1px solid rgba(255,255,255,0.06)',overflow:'hidden',position:'sticky',top:'1rem'}}>
                  <div style={{background:'#202c33',padding:'0.7rem 1rem',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.65rem'}}>
                      <Smartphone size={16} color="#25d366"/>
                      <div>
                        <div style={{fontSize:'0.76rem',fontWeight:700,color:'white'}}>Live Preview</div>
                        <div style={{fontSize:'0.59rem',color:'#8696a0'}}>{vars.length>0?`Variante ${previewVariantIdx+1} de ${vars.length}`:'Selecione um template'}</div>
                      </div>
                    </div>
                    {vars.length>1&&<button type="button" onClick={()=>setPreviewVariantIdx(v=>(v+1)%vars.length)} className="btn btn-secondary" style={{padding:'0.3rem 0.5rem',fontSize:'0.65rem',gap:'0.3rem'}}><RefreshCw size={11}/> Pr\u00F3xima</button>}
                  </div>
                  {vars.length>1&&(
                    <div style={{background:'#1a2730',display:'flex',overflowX:'auto',borderBottom:'1px solid rgba(255,255,255,0.04)',padding:'0.35rem 0.75rem',gap:'0.3rem'}}>
                      {vars.map((_,i)=>(
                        <button key={i} type="button" onClick={()=>setPreviewVariantIdx(i)} style={{background:previewVariantIdx===i?'rgba(37,211,102,0.15)':'transparent',border:`1px solid ${previewVariantIdx===i?'#25d366':'rgba(255,255,255,0.08)'}`,color:previewVariantIdx===i?'#25d366':'#8696a0',borderRadius:'6px',padding:'0.2rem 0.5rem',fontSize:'0.65rem',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s'}}>
                          {i===0?'\uD83D\uDCC4 Base':`\u270F\uFE0F Var. ${i+1}`}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{flex:1,padding:'1rem',display:'flex',flexDirection:'column',backgroundImage:'radial-gradient(circle,rgba(255,255,255,0.015) 1px,transparent 1px)',backgroundSize:'16px 16px',backgroundColor:'#0b141a',minHeight:'200px',overflowY:'auto'}}>
                    {templateId&&previewText?(
                      <div style={{alignSelf:'flex-start',maxWidth:'92%',background:'#005c4b',color:'white',padding:'0.55rem 0.8rem',borderRadius:'0 8px 8px 8px',fontSize:'0.8rem',lineHeight:1.45,boxShadow:'0 1px 2px rgba(0,0,0,0.3)',wordBreak:'break-word',animation:'wa-fadeUp 0.15s ease'}}>
                        {(()=>{const sel=templates.find(t=>t.id===templateId);return sel?.imageUrl&&previewVariantIdx===0?<img src={sel.imageUrl} alt="M\u00EDdia" style={{borderRadius:'6px',width:'100%',maxHeight:'160px',objectFit:'cover',marginBottom:'0.5rem'}}/>:null;})()}
                        <div style={{whiteSpace:'pre-wrap'}}>{previewText}</div>
                        <div style={{display:'flex',justifyContent:'flex-end',fontSize:'0.56rem',color:'rgba(255,255,255,0.4)',marginTop:'4px'}}>
                          <span>{new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
                        </div>
                      </div>
                    ):(
                      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'rgba(255,255,255,0.2)',fontSize:'0.75rem'}}>Selecione um template para ver a simula\u00E7\u00E3o.</div>
                    )}
                  </div>
                  <div style={{background:'rgba(255,255,255,0.02)',borderTop:'1px solid rgba(255,255,255,0.04)',padding:'0.75rem 1rem'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.4rem',marginBottom:'0.5rem'}}>
                      <div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.35)',display:'flex',flexDirection:'column',gap:'0.2rem'}}>
                        <span>\u23F1 Delay: <strong style={{color:'#e2e8f0'}}>{delayMin}s \u2013 {delayMax}s</strong></span>
                        <span>\uD83C\uDFB2 Variantes: <strong style={{color:'#34d399'}}>{vars.length}</strong></span>
                      </div>
                      <div style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.35)',display:'flex',flexDirection:'column',gap:'0.2rem'}}>
                        <span>\u2615 Lote: <strong style={{color:'#a78bfa'}}>{batchSize>0?`${batchSize} msgs`:'Desativado'}</strong></span>
                        <span>\uD83D\uDEE1\uFE0F Risco: <strong style={{color:riskColor}}>{riskLabel}</strong></span>
                      </div>
                    </div>
                    {contactsCount>0&&est&&(
                      <>
                        <div style={{height:'1px',background:'rgba(255,255,255,0.05)',marginBottom:'0.5rem'}}/>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.68rem',color:'rgba(255,255,255,0.4)'}}>
                          <span>Contatos: <strong style={{color:'white'}}>{contactsCount}</strong></span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.68rem',color:'rgba(255,255,255,0.4)',marginTop:'0.2rem'}}>
                          <span>Tempo total estimado (c/ pausas):</span>
                          <span style={{fontWeight:700,color:'#10b981'}}>{est.min} ~ {est.max}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={()=>setShowAddCampaign(false)} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting||(targetType==='GROUP'&&groups.length===0)||(targetType==='SEGMENT'&&segments.length===0)||templates.length===0}>
                  {isSubmitting?'Criando...':`\uD83D\uDE80 Criar Campanha${vars.length>1?` (${vars.length} variantes)`:''}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        @keyframes wa-fadeUp { from{transform:translateY(6px);opacity:0}to{transform:translateY(0);opacity:1} }
        input[type=range]{height:4px;border-radius:99px;cursor:pointer}
      `}</style>
    </AppLayout>
  );
}
