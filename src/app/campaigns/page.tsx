'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { 
  Send, Plus, Trash2, Play, Pause, X, StopCircle,
  AlertCircle, Clock, Eye, Calendar, Smartphone,
  Shuffle, RefreshCw, Coffee, Shield
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
  startHour?: number;
  endHour?: number;
  allowedDays?: number[];
  instanceMode?: string;
  instanceNames?: string[];
  messageVariants?: string[];
  groupId?: string | null;
  segmentId?: string | null;
  companyId?: string | null;
  group?: { id: string; name: string } | null;
  segment?: { id: string; name: string } | null;
  company?: { id: string; name: string; segment?: string | null } | null;
  template: { id: string; name: string };
  stats: { total: number; sent: number; delivered: number; read: number; failed: number; pending: number; };
  createdAt: string;
  scheduledAt?: string | null;
}
interface Group { id: string; name: string; _count?: { contacts: number }; }
interface InstanceOption {
  name: string;
  phone?: string | null;
  status: string;
  healthScore: number;
  warmupProgress?: number;
  activeWarmupType?: string;
  isMatured?: boolean;
}
interface Template { 
  id: string; 
  name: string; 
  body: string; 
  imageUrl?: string | null; 
  enableHook?: boolean; 
  hookMessage?: string | null; 
  hookVariants?: string[]; 
  hookMode?: 'ON_REPLY' | 'DELAY'; 
  hookDelay?: number; 
}
interface CompanyOption { id: string; name: string; segment?: string | null; isDefault: boolean; }

const DELAY_PRESETS = [
  { id: 'safe',   label: '🛡️ Muito Seguro', min: 45, max: 120 },
  { id: 'medium', label: '⚖️ Balanceado',   min: 20, max: 60  },
  { id: 'fast',   label: '⚡ Rápido',        min: 8,  max: 20  },
  { id: 'custom', label: '⚙️ Manual',        min: 20, max: 60  },
];

const BATCH_PRESETS = [
  { label: 'Desativado',               size: 0,  cooldown: 0   },
  { label: 'A cada 20 msgs → 10min',   size: 20, cooldown: 600 },
  { label: 'A cada 30 msgs → 12min',   size: 30, cooldown: 720 },
  { label: 'A cada 50 msgs → 15min',   size: 50, cooldown: 900 },
];

function parseSpintax(text: string): string {
  let result = text;
  const pattern = /\{([^{}]+)\}/;
  let match;
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
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [instances, setInstances] = useState<InstanceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddCampaign, setShowAddCampaign] = useState(false);

  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<'GROUP' | 'SEGMENT'>('GROUP');
  const [groupId, setGroupId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [delayMin, setDelayMin] = useState(20);
  const [delayMax, setDelayMax] = useState(60);
  const [delayPreset, setDelayPreset] = useState<string>('medium');
  const [startHour, setStartHour] = useState(8);
  const [endHour, setEndHour] = useState(20);
  const [allowedDays, setAllowedDays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [hourPreset, setHourPreset] = useState<'business' | 'expanded' | 'wide' | 'all' | 'custom'>('expanded');
  const [instanceMode, setInstanceMode] = useState<'AUTO_MATURE' | 'SPECIFIC'>('AUTO_MATURE');
  const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [batchSize, setBatchSize] = useState(0);
  const [batchCooldown, setBatchCooldown] = useState(600);
  const [batchPresetIdx, setBatchPresetIdx] = useState(0);
  const [previewText, setPreviewText] = useState('');

  const fetchCampaigns = async () => {
    setLoading(true);
    try { const r = await fetch('/api/campaigns'); if (r.ok) setCampaigns((await r.json()).campaigns || []); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const fetchData = async () => {
    try {
      const [cr, tr, sr, cor, ir] = await Promise.all([
        fetch('/api/contacts'),
        fetch('/api/templates'),
        fetch('/api/contacts/segments'),
        fetch('/api/companies'),
        fetch('/api/whatsapp/instances'),
      ]);
      if (cr.ok) {
        const gList = (await cr.json()).groups || [];
        setGroups(gList);
        setGroupId(prev => (prev && gList.some((g: any) => g.id === prev) ? prev : (gList[0]?.id || '')));
      }
      if (tr.ok) {
        const tList = (await tr.json()).templates || [];
        setTemplates(tList);
        setTemplateId(prev => (prev && tList.some((t: any) => t.id === prev) ? prev : (tList[0]?.id || '')));
      }
      if (sr.ok) {
        const sList = (await sr.json()).segments || [];
        setSegments(sList);
        setSegmentId(prev => (prev && sList.some((s: any) => s.id === prev) ? prev : (sList[0]?.id || '')));
      }
      if (cor.ok) {
        const cos: CompanyOption[] = (await cor.json()).companies || [];
        setCompanies(cos);
        const def = cos.find((c) => c.isDefault) || cos[0];
        if (def) setCompanyId(prev => prev || def.id);
      }
      if (ir.ok) {
        const instData = await ir.json();
        const list: InstanceOption[] = Array.isArray(instData) ? instData : (instData.instances || []);
        setInstances(list);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchCampaigns(); fetchData(); }, []);

  const allVariants = useCallback((): string[] => {
    const sel = templates.find(t => t.id === templateId) || templates[0];
    if (!sel) return [];
    return [sel.body, ...(sel.bodyVariants || [])].filter(Boolean);
  }, [templates, templateId]);

  const regeneratePreview = useCallback(() => {
    const sel = templates.find(t => t.id === templateId) || templates[0];
    if (!sel) { setPreviewText(''); return; }
    const allBodies = [sel.body, ...(sel.bodyVariants || [])].filter(Boolean);
    const chosenBody = allBodies[Math.floor(Math.random() * allBodies.length)] || sel.body || '';
    const raw = chosenBody.replace(/{{nome}}/g, 'João Silva').replace(/{{link}}/g, 'https://wa.me/grupopromo');
    setPreviewText(parseSpintax(raw));
  }, [templates, templateId]);

  useEffect(() => { regeneratePreview(); }, [templateId, templates, regeneratePreview]);

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
    if (groups[0]) setGroupId(groups[0].id);
    if (segments[0]) setSegmentId(segments[0].id);
    if (templates[0]) setTemplateId(templates[0].id);
    const defComp = companies.find(c => c.isDefault) || companies[0];
    if (defComp) setCompanyId(defComp.id);
    setDelayMin(20); setDelayMax(60); setDelayPreset('medium');
    setBatchSize(0); setBatchCooldown(600); setBatchPresetIdx(0);
    setStartHour(8); setEndHour(20); setAllowedDays([1, 2, 3, 4, 5, 6]); setHourPreset('expanded');
    setInstanceMode('AUTO_MATURE'); setSelectedInstances([]);
    setIsScheduled(false); setScheduledAt(''); setErrorMsg('');
    setShowAddCampaign(true);
    fetchData();
  };

  const handlePresetChange = (p: typeof DELAY_PRESETS[0]) => { setDelayPreset(p.id); if (p.id !== 'custom') { setDelayMin(p.min); setDelayMax(p.max); } };
  const handleBatchPreset = (i: number) => { setBatchPresetIdx(i); setBatchSize(BATCH_PRESETS[i].size); setBatchCooldown(BATCH_PRESETS[i].cooldown); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setErrorMsg('');
    const targetId = targetType === 'GROUP' ? groupId : segmentId;
    if (!name || !targetId || !templateId) { setErrorMsg('Todos os campos marcados são obrigatórios'); return; }
    if (isScheduled && !scheduledAt) { setErrorMsg('Selecione data e hora.'); return; }
    if (delayMin < 5) { setErrorMsg('Delay mínimo: 5 segundos.'); return; }
    if (delayMax <= delayMin) { setErrorMsg('Delay máximo deve ser maior que o mínimo.'); return; }
    if (startHour >= endHour && !(startHour === 0 && endHour === 23)) { setErrorMsg('Horário de início deve ser menor que o horário de término.'); return; }
    if (allowedDays.length === 0) { setErrorMsg('Selecione ao menos um dia da semana permitido.'); return; }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          companyId,
          targetType,
          targetId,
          templateId,
          delayMin,
          delayMax,
          batchSize: batchSize > 0 ? batchSize : undefined,
          batchCooldown: batchSize > 0 ? batchCooldown : undefined,
          startHour,
          endHour,
          allowedDays,
          instanceMode,
          instanceNames: instanceMode === 'SPECIFIC' ? selectedInstances : undefined,
          scheduledAt: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro ao criar campanha');
      setShowAddCampaign(false);
      fetchCampaigns();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: 'START' | 'PAUSE' | 'CANCEL') => {
    try {
      const r = await fetch(`/api/campaigns/${id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!r.ok) alert((await r.json()).message || 'Erro.'); fetchCampaigns();
    } catch { alert('Erro de conexão.'); }
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
    if (status === 'COMPLETED') return <span className="badge badge-success">Concluída</span>;
    if (status === 'CANCELLED') return <span className="badge badge-error">Cancelada</span>;
    return <span className="badge badge-info">{status}</span>;
  };

  const selectedTemplate = templates.find(t => t.id === templateId) || templates[0];
  const contactsCount = targetType === 'GROUP'
    ? (groups.find(g => g.id === groupId)?._count?.contacts || 0)
    : 0;

  const timeEst = () => {
    if (contactsCount === 0) return null;
    const avgSec = (delayMin + delayMax) / 2;
    let totalSec = contactsCount * avgSec;
    if (batchSize > 0) {
      const batches = Math.floor(contactsCount / batchSize);
      totalSec += batches * batchCooldown;
    }
    const fmt = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    };
    return { min: fmt(totalSec * 0.9), max: fmt(totalSec * 1.1) };
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
                      {camp.company && <span>Empresa: <strong style={{color:'#38bdf8'}}>{camp.company.name}</strong></span>}
                      <span>Template: <strong>{camp.template.name}</strong></span>
                      {camp.group ? <span>Grupo: <strong>{camp.group.name}</strong></span> : camp.segment ? <span>Segmento: <strong>{camp.segment.name}</strong></span> : null}
                      <span style={{display:'flex',alignItems:'center',gap:'0.25rem'}} translate="no"><Clock size={12}/>{camp.delayMin} seg – {camp.delayMax} seg</span>
                      <span style={{display:'flex',alignItems:'center',gap:'0.25rem',color:'#38bdf8',fontWeight:600}} title="Janela de Horário Permitido">
                        ⏰ {String(camp.startHour ?? 8).padStart(2,'0')}h–{String(camp.endHour ?? 20).padStart(2,'0')}h
                      </span>
                      <span style={{display:'flex',alignItems:'center',gap:'0.25rem',color:camp.instanceMode==='SPECIFIC'?'#a78bfa':'#22c55e',fontWeight:600}} title="Chip / Instância de Disparo">
                        📱 {camp.instanceMode === 'SPECIFIC' && camp.instanceNames?.length ? `${camp.instanceNames.length} chip(s) fixo(s)` : '⚡ Rotação 100% Maturados'}
                      </span>
                      {(camp.batchSize??0)>0 && <span style={{display:'flex',alignItems:'center',gap:'0.25rem',color:'#a78bfa'}}><Coffee size={12}/>Pausa a cada {camp.batchSize} msgs</span>}
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
          <div className="modal-content" style={{maxWidth:'1080px',width:'95vw',animation:'modalIn 0.22s cubic-bezier(0.16,1,0.3,1)',border:'1px solid rgba(255,255,255,0.08)'}}>
            <div className="modal-header" style={{borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
              <h3 className="modal-title" style={{fontSize:'1.2rem',fontWeight:700,color:'#f8fafc',display:'flex',alignItems:'center',gap:'0.5rem'}}>
                🚀 Configurar Campanha de Disparos
              </h3>
              <X className="modal-close" onClick={()=>setShowAddCampaign(false)}/>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(360px, 1fr))',gap:'1.5rem',padding:'1.5rem',alignItems:'start',maxHeight:'82vh',overflowY:'auto'}}>

                {/* COLUNA 1: DADOS DO FORMULÁRIO */}
                <div style={{display:'flex',flexDirection:'column',gap:'1.2rem'}}>
                  {errorMsg && (
                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem',backgroundColor:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',color:'#ef4444',padding:'0.75rem',borderRadius:'8px',fontSize:'0.8125rem'}}>
                      <AlertCircle size={16}/><span>{errorMsg}</span>
                    </div>
                  )}

                  {/* Informações Gerais */}
                  <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:'10px',padding:'1.2rem',display:'flex',flexDirection:'column',gap:'1rem'}}>
                    <div style={{fontSize:'0.88rem',fontWeight:700,color:'#f1f5f9',borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:'0.5rem',marginBottom:'0.2rem'}}>
                      📋 Informações Gerais
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0',marginBottom:'0.4rem',display:'block'}}>Nome da Campanha *</label>
                      <input type="text" className="input-control" placeholder="Ex: Promoção de Domingo" value={name} onChange={e=>setName(e.target.value)} required style={{width:'100%'}}/>
                    </div>

                    {/* SELEÇÃO DA EMPRESA */}
                    <div className="form-group">
                      <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0',marginBottom:'0.4rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <span>🏢 Empresa / Base de Conhecimento IA *</span>
                        <Link href="/companies" target="_blank" style={{color:'#25d366',fontSize:'0.7rem',textDecoration:'none',fontWeight:600}}>+ Gerenciar Empresas</Link>
                      </label>
                      <select className="input-control" value={companyId} onChange={e=>setCompanyId(e.target.value)} required style={{width:'100%'}}>
                        {companies.length===0?<option value="">Carregando empresas...</option>:companies.map(c=>(
                          <option key={c.id} value={c.id}>
                            {c.name} {c.segment?`(${c.segment})`:''} {c.isDefault?'⭐ Padrão':''}
                          </option>
                        ))}
                      </select>
                      <span style={{fontSize:'0.65rem',color:'#94a3b8',marginTop:'0.25rem',display:'block'}}>
                        A IA usará os dados (produtos, FAQ, preços) desta empresa para atender as respostas dos clientes.
                      </span>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0',marginBottom:'0.4rem',display:'block'}}>Destinatários *</label>
                      <div style={{display:'flex',gap:'1.5rem',marginBottom:'0.6rem'}}>
                        {(['GROUP','SEGMENT'] as const).map(t=>(
                          <label key={t} style={{display:'flex',alignItems:'center',gap:'0.4rem',fontSize:'0.82rem',cursor:'pointer',color:'#94a3b8',userSelect:'none'}}>
                            <input type="radio" name="targetType" value={t} checked={targetType===t} onChange={()=>{setTargetType(t);if(t==='GROUP'){setGroupId(groups[0]?.id||'');setSegmentId('');}else{setSegmentId(segments[0]?.id||'');setGroupId('');}}} style={{accentColor:'#25d366'}}/>
                            {t==='GROUP'?'Grupo Estático':'Segmentação Dinâmica'}
                          </label>
                        ))}
                      </div>
                      {targetType==='GROUP'?(
                        <select className="input-control" value={groupId} onChange={e=>setGroupId(e.target.value)} required style={{width:'100%'}}>
                        {groups.length===0?<option value="">Crie um grupo primeiro!</option>:groups.map(g=><option key={g.id} value={g.id}>{g.name} ({g._count?.contacts||0} contatos)</option>)}
                        </select>
                      ):(
                        <select className="input-control" value={segmentId} onChange={e=>setSegmentId(e.target.value)} required style={{width:'100%'}}>
                          {segments.length===0?<option value="">Crie uma segmentação primeiro!</option>:segments.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0',marginBottom:'0.4rem',display:'block'}}>Mensagem Base (Template) *</label>
                      <select className="input-control" value={templateId} onChange={e=>setTemplateId(e.target.value)} required style={{width:'100%'}}>
                        {templates.length===0?<option value="">Crie um template primeiro!</option>:templates.map(t=><option key={t.id} value={t.id}>{t.name} {t.enableHook ? '🛡️ (2 Etapas)' : ''}</option>)}
                      </select>
                      {(() => {
                        const selTmpl = templates.find(t => t.id === templateId);
                        if (!selTmpl?.enableHook) return null;
                        return (
                          <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.25)', fontSize: '0.725rem', color: '#25d366', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Shield size={13} />
                            <span>
                              <strong>Proteção Anti-Ban Ativa:</strong> Envia saudação curta primeiro ({selTmpl.hookMode === 'ON_REPLY' ? 'aguarda resposta' : `após ${selTmpl.hookDelay || 15}s`}).
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Informação sobre variações no template */}
                  <div style={{background:'rgba(52,211,153,0.02)',border:'1px solid rgba(52,211,153,0.12)',borderRadius:'10px',padding:'1rem'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem',fontSize:'0.82rem',fontWeight:600,color:'#34d399',marginBottom:'0.35rem'}}>
                      <Shuffle size={14}/> Variações de Texto Anti-Ban
                    </div>
                    <p style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.4)',margin:0,lineHeight:1.5}}>
                      As variações do texto são configuradas diretamente no <strong style={{color:'#34d399'}}>Template</strong> selecionado. O sistema rotaciona automaticamente entre as versões para cada contato.
                    </p>
                  </div>

                  {/* CHIP / INSTÂNCIAS DE DISPARO (COM BLINDAGEM DE MATURAÇÃO) */}
                  <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:'10px',padding:'1.2rem',display:'flex',flexDirection:'column',gap:'1rem'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:'0.5rem'}}>
                      <div style={{fontSize:'0.88rem',fontWeight:700,color:'#f1f5f9',display:'flex',alignItems:'center',gap:'0.4rem'}}>
                        📱 Chip / Instâncias de Envio
                      </div>
                      <span style={{fontSize:'0.7rem',color:'#22c55e',background:'rgba(34,197,94,0.1)',padding:'0.15rem 0.5rem',borderRadius:'999px',fontWeight:600}}>
                        🛡️ Chips em Aquecimento Protegidos
                      </span>
                    </div>

                    {/* Alternador de Modo */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem'}}>
                      <div
                        onClick={() => setInstanceMode('AUTO_MATURE')}
                        style={{
                          padding:'0.75rem',
                          borderRadius:'8px',
                          border: instanceMode === 'AUTO_MATURE' ? '1.5px solid #25d366' : '1px solid var(--border)',
                          background: instanceMode === 'AUTO_MATURE' ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.02)',
                          cursor:'pointer',
                          transition:'all 0.2s',
                        }}
                      >
                        <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontWeight:700,color:instanceMode==='AUTO_MATURE'?'#25d366':'#e2e8f0',fontSize:'0.8rem'}}>
                          ⚡ Rotação Automática (Recomendado)
                        </div>
                        <p style={{fontSize:'0.68rem',color:'#94a3b8',margin:'0.3rem 0 0 0',lineHeight:1.35}}>
                          Dispara apenas usando chips <strong>100% maturados</strong>. Chips que ainda estão aquecendo são ignorados para evitar ban.
                        </p>
                      </div>

                      <div
                        onClick={() => setInstanceMode('SPECIFIC')}
                        style={{
                          padding:'0.75rem',
                          borderRadius:'8px',
                          border: instanceMode === 'SPECIFIC' ? '1.5px solid #38bdf8' : '1px solid var(--border)',
                          background: instanceMode === 'SPECIFIC' ? 'rgba(56,189,248,0.08)' : 'rgba(255,255,255,0.02)',
                          cursor:'pointer',
                          transition:'all 0.2s',
                        }}
                      >
                        <div style={{display:'flex',alignItems:'center',gap:'0.4rem',fontWeight:700,color:instanceMode==='SPECIFIC'?'#38bdf8':'#e2e8f0',fontSize:'0.8rem'}}>
                          🎯 Escolher Chip(s) Específico(s)
                        </div>
                        <p style={{fontSize:'0.68rem',color:'#94a3b8',margin:'0.3rem 0 0 0',lineHeight:1.35}}>
                          Selecione manualmente qual(is) instância(s) quer usar exclusivamente nesta campanha.
                        </p>
                      </div>
                    </div>

                    {/* Lista de Seleção de Chips Manuais */}
                    {instanceMode === 'SPECIFIC' && (
                      <div style={{marginTop:'0.4rem',display:'flex',flexDirection:'column',gap:'0.5rem',animation:'wa-fadeUp 0.15s ease'}}>
                        <div style={{fontSize:'0.75rem',color:'#94a3b8',fontWeight:600}}>
                          Selecione os chips para esta campanha:
                        </div>

                        {instances.length === 0 ? (
                          <div style={{padding:'0.75rem',fontSize:'0.75rem',color:'#9ca3af',textAlign:'center',background:'rgba(255,255,255,0.02)',borderRadius:'6px'}}>
                            Nenhuma instância cadastrada. O sistema usará a sessão padrão.
                          </div>
                        ) : (
                          <div style={{display:'flex',flexDirection:'column',gap:'0.4rem',maxHeight:'180px',overflowY:'auto'}}>
                            {instances.map((inst) => {
                              const isSelected = selectedInstances.includes(inst.name);
                              const isMatured = inst.isMatured || (inst.warmupProgress ?? 0) >= 100;
                              const isWarming = !isMatured && (inst.activeWarmupType === 'SINGLE' || inst.activeWarmupType === 'POOL');
                              const isConnected = inst.status === 'CONNECTED';

                              return (
                                <div
                                  key={inst.name}
                                  onClick={() => {
                                    setSelectedInstances(prev =>
                                      prev.includes(inst.name)
                                        ? prev.filter(x => x !== inst.name)
                                        : [...prev, inst.name]
                                    );
                                  }}
                                  style={{
                                    display:'flex',
                                    justifyContent:'space-between',
                                    alignItems:'center',
                                    padding:'0.55rem 0.8rem',
                                    borderRadius:'6px',
                                    border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
                                    background: isSelected ? 'rgba(56,189,248,0.12)' : 'rgba(0,0,0,0.2)',
                                    cursor:'pointer',
                                    transition:'all 0.15s',
                                  }}
                                >
                                  <div style={{display:'flex',alignItems:'center',gap:'0.6rem'}}>
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => {}}
                                      style={{accentColor:'#38bdf8',cursor:'pointer'}}
                                    />
                                    <div>
                                      <div style={{fontSize:'0.8rem',fontWeight:600,color:'#f8fafc',display:'flex',alignItems:'center',gap:'0.35rem'}}>
                                        {inst.name}
                                        {inst.phone && <span style={{fontSize:'0.7rem',color:'#94a3b8',fontWeight:400}}>({inst.phone})</span>}
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
                                    {isConnected ? (
                                      isMatured ? (
                                        <span style={{fontSize:'0.65rem',color:'#22c55e',background:'rgba(34,197,94,0.12)',padding:'0.1rem 0.4rem',borderRadius:'4px',fontWeight:700}}>
                                          🟢 100% Maturado (Pronto)
                                        </span>
                                      ) : isWarming ? (
                                        <span style={{fontSize:'0.65rem',color:'#eab308',background:'rgba(234,179,8,0.12)',padding:'0.1rem 0.4rem',borderRadius:'4px',fontWeight:700}} title="Em fase de aquecimento">
                                          ⚠️ Em Aquecimento ({inst.warmupProgress || 0}%)
                                        </span>
                                      ) : (
                                        <span style={{fontSize:'0.65rem',color:'#94a3b8',background:'rgba(255,255,255,0.06)',padding:'0.1rem 0.4rem',borderRadius:'4px'}}>
                                          ⚪ Sem Aquecimento
                                        </span>
                                      )
                                    ) : (
                                      <span style={{fontSize:'0.65rem',color:'#ef4444',background:'rgba(239,68,68,0.12)',padding:'0.1rem 0.4rem',borderRadius:'4px'}}>
                                        🔴 Desconectado
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {selectedInstances.some(name => {
                          const inst = instances.find(i => i.name === name);
                          const isMatured = inst?.isMatured || (inst?.warmupProgress ?? 0) >= 100;
                          return !isMatured && (inst?.activeWarmupType === 'SINGLE' || inst?.activeWarmupType === 'POOL');
                        }) && (
                          <div style={{padding:'0.5rem 0.75rem',borderRadius:'6px',background:'rgba(234,179,8,0.1)',border:'1px solid rgba(234,179,8,0.3)',color:'#fde047',fontSize:'0.72rem',display:'flex',alignItems:'center',gap:'0.4rem'}}>
                            <AlertCircle size={14} style={{flexShrink:0}}/>
                            <span><strong>Aviso Anti-Ban:</strong> Você selecionou um chip em aquecimento ativo. Recomendamos usar apenas chips 100% maturados para campanhas frias.</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* CONFIGURAÇÕES ANTI-BAN */}
                  <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:'10px',padding:'1.2rem',display:'flex',flexDirection:'column',gap:'1rem'}}>
                    <div style={{fontSize:'0.88rem',fontWeight:700,color:'#f1f5f9',borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:'0.5rem'}}>
                      🛡️ Configurações Anti-Ban
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0',marginBottom:'0.4rem',display:'block'}}>Intervalo entre Mensagens</label>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.4rem',marginBottom:'0.8rem'}}>
                        {DELAY_PRESETS.map(p=>(
                          <button key={p.id} type="button" onClick={()=>handlePresetChange(p)} className={`btn ${delayPreset===p.id?'btn-primary':'btn-secondary'}`} style={{padding:'0.45rem 0',fontSize:'0.65rem',fontWeight:700,width:'100%'}}>{p.label}</button>
                        ))}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
                        <div>
                          <label style={{fontSize:'0.68rem',color:'#94a3b8',display:'flex',justifyContent: 'space-between',marginBottom:'0.3rem'}}><span>Mínimo</span><strong style={{color:'#e2e8f0'}} translate="no">{delayMin} seg</strong></label>
                          <input type="range" min={5} max={120} step={1} value={delayMin} onChange={e=>{const v=parseInt(e.target.value);setDelayMin(v);if(v>=delayMax)setDelayMax(v+5);setDelayPreset('custom');}} style={{width:'100%',accentColor:'#25d366'}}/>
                        </div>
                        <div>
                          <label style={{fontSize:'0.68rem',color:'#94a3b8',display:'flex',justifyContent: 'space-between',marginBottom:'0.3rem'}}><span>Máximo</span><strong style={{color:'#e2e8f0'}} translate="no">{delayMax} seg</strong></label>
                          <input type="range" min={6} max={180} step={1} value={delayMax} onChange={e=>{const v=parseInt(e.target.value);setDelayMax(v);if(v<=delayMin)setDelayMin(v-5);setDelayPreset('custom');}} style={{width:'100%',accentColor:'#25d366'}}/>
                        </div>
                      </div>
                      <div style={{marginTop:'0.8rem',display:'flex',alignItems:'center',gap:'0.6rem',background:'rgba(0,0,0,0.15)',padding:'0.5rem 0.8rem',borderRadius:'8px'}}>
                        <Shield size={14} style={{color:riskColor,flexShrink:0}}/>
                        <div style={{flex:1,background:'rgba(255,255,255,0.06)',borderRadius:'99px',height:'6px',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${(risk/5)*100}%`,background:riskColor,borderRadius:'99px',transition:'width 0.3s,background 0.3s'}}/>
                        </div>
                        <span style={{fontSize:'0.7rem',color:riskColor,fontWeight:700,minWidth:'80px',textAlign:'right'}}>Risco: {riskLabel}</span>
                      </div>
                    </div>

                    <div className="form-group" style={{borderTop:'1px solid rgba(255,255,255,0.05)',paddingTop:'1rem'}}>
                      <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0',marginBottom:'0.4rem',display:'block'}}>Pausa de Segurança entre Lotes</label>
                      <div style={{fontSize:'0.68rem',color:'rgba(255,255,255,0.4)',marginBottom:'0.6rem'}}>
                        Simula o descanso humano inserindo pausas longas programadas na fila.
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'0.4rem'}}>
                        {BATCH_PRESETS.map((p,i)=>(
                          <button key={i} type="button" onClick={()=>handleBatchPreset(i)} className={`btn ${batchPresetIdx===i?'btn-primary':'btn-secondary'}`} style={{padding:'0.45rem 0',fontSize:'0.65rem',fontWeight:700,width:'100%',borderColor:batchPresetIdx===i?'':'rgba(167,139,250,0.2)'}}>{p.label}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* JANELA DE HORÁRIOS E DIAS PERMITIDOS */}
                  <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:'10px',padding:'1.2rem',display:'flex',flexDirection:'column',gap:'1rem'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.05)',paddingBottom:'0.5rem'}}>
                      <div style={{fontSize:'0.88rem',fontWeight:700,color:'#f1f5f9',display:'flex',alignItems:'center',gap:'0.4rem'}}>
                        ⏰ Janela de Horários e Dias de Envio
                      </div>
                      <span style={{fontSize:'0.7rem',color:'#22c55e',background:'rgba(34,197,94,0.1)',padding:'0.15rem 0.5rem',borderRadius:'999px',fontWeight:600}}>
                        🌙 Pausa Noturna Ativa
                      </span>
                    </div>

                    {/* Presets de Horário */}
                    <div>
                      <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0',marginBottom:'0.4rem',display:'block'}}>
                        Horário Permitido de Disparo
                      </label>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'0.35rem',marginBottom:'0.75rem'}}>
                        {[
                          { id: 'business', label: '💼 08h às 18h', start: 8, end: 18 },
                          { id: 'expanded', label: '⚡ 08h às 20h', start: 8, end: 20 },
                          { id: 'wide', label: '🌅 07h às 22h', start: 7, end: 22 },
                          { id: 'all', label: '🌐 24 Horas', start: 0, end: 23 },
                        ].map((hp) => (
                          <button
                            key={hp.id}
                            type="button"
                            onClick={() => { setHourPreset(hp.id as any); setStartHour(hp.start); setEndHour(hp.end); }}
                            className={`btn ${hourPreset === hp.id ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ padding: '0.4rem 0', fontSize: '0.65rem', fontWeight: 700, width: '100%' }}
                          >
                            {hp.label}
                          </button>
                        ))}
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
                        <div>
                          <label style={{fontSize:'0.68rem',color:'#94a3b8',display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}>
                            <span>Início dos envios</span>
                            <strong style={{color:'#38bdf8'}}>{String(startHour).padStart(2,'0')}:00</strong>
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={22}
                            step={1}
                            value={startHour}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setStartHour(v);
                              if (v >= endHour) setEndHour(Math.min(23, v + 1));
                              setHourPreset('custom');
                            }}
                            style={{width:'100%',accentColor:'#38bdf8'}}
                          />
                        </div>
                        <div>
                          <label style={{fontSize:'0.68rem',color:'#94a3b8',display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}>
                            <span>Pausa dos envios</span>
                            <strong style={{color:'#38bdf8'}}>{String(endHour).padStart(2,'0')}:00</strong>
                          </label>
                          <input
                            type="range"
                            min={1}
                            max={23}
                            step={1}
                            value={endHour}
                            onChange={(e) => {
                              const v = parseInt(e.target.value);
                              setEndHour(v);
                              if (v <= startHour) setStartHour(Math.max(0, v - 1));
                              setHourPreset('custom');
                            }}
                            style={{width:'100%',accentColor:'#38bdf8'}}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Dias da Semana Permitidos */}
                    <div style={{borderTop:'1px solid rgba(255,255,255,0.05)',paddingTop:'0.8rem'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.4rem'}}>
                        <label className="form-label" style={{fontWeight:600,fontSize:'0.8rem',color:'#e2e8f0',margin:0}}>
                          Dias da Semana Permitidos
                        </label>
                        <div style={{display:'flex',gap:'0.3rem'}}>
                          <button
                            type="button"
                            onClick={() => setAllowedDays([1, 2, 3, 4, 5])}
                            className="btn btn-secondary"
                            style={{fontSize:'0.65rem',padding:'0.2rem 0.45rem'}}
                          >
                            Seg-Sex
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllowedDays([1, 2, 3, 4, 5, 6])}
                            className="btn btn-secondary"
                            style={{fontSize:'0.65rem',padding:'0.2rem 0.45rem'}}
                          >
                            Seg-Sáb
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllowedDays([0, 1, 2, 3, 4, 5, 6])}
                            className="btn btn-secondary"
                            style={{fontSize:'0.65rem',padding:'0.2rem 0.45rem'}}
                          >
                            Todos
                          </button>
                        </div>
                      </div>

                      <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',gap:'0.3rem'}}>
                        {[
                          { day: 1, label: 'Seg' },
                          { day: 2, label: 'Ter' },
                          { day: 3, label: 'Qua' },
                          { day: 4, label: 'Qui' },
                          { day: 5, label: 'Sex' },
                          { day: 6, label: 'Sáb' },
                          { day: 0, label: 'Dom' },
                        ].map((d) => {
                          const active = allowedDays.includes(d.day);
                          return (
                            <button
                              key={d.day}
                              type="button"
                              onClick={() => {
                                setAllowedDays((prev) =>
                                  prev.includes(d.day)
                                    ? prev.length > 1 ? prev.filter((x) => x !== d.day) : prev
                                    : [...prev, d.day]
                                );
                              }}
                              style={{
                                padding:'0.45rem 0',
                                fontSize:'0.72rem',
                                fontWeight: active ? 700 : 500,
                                borderRadius:'6px',
                                border: active ? '1px solid #25d366' : '1px solid rgba(255,255,255,0.08)',
                                background: active ? 'rgba(37,211,102,0.15)' : 'rgba(255,255,255,0.02)',
                                color: active ? '#25d366' : '#9ca3af',
                                cursor:'pointer',
                                transition:'all 0.15s',
                              }}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>

                      <p style={{fontSize:'0.68rem',color:'#9ca3af',margin:'0.6rem 0 0 0',lineHeight:1.4}}>
                        🌙 <strong>Anti-Incômodo:</strong> Se a campanha estiver rodando e passar das {String(endHour).padStart(2,'0')}:00 (ou em dia desmarcado), os disparos pausam sozinhos e retornam no próximo dia permitido às {String(startHour).padStart(2,'0')}:00.
                      </p>
                    </div>
                  </div>

                  {/* AGENDAMENTO */}
                  <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.05)',borderRadius:'10px',padding:'1.2rem'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.82rem',fontWeight:700,color:'#f1f5f9',userSelect:'none'}}>
                      <input type="checkbox" checked={isScheduled} onChange={e=>{setIsScheduled(e.target.checked);if(e.target.checked&&!scheduledAt){const d=new Date();d.setDate(d.getDate()+1);setScheduledAt(d.toISOString().slice(0,16));}}} style={{accentColor:'#25d366'}}/>
                      📅 Agendar envio para depois
                    </label>
                    {isScheduled&&(
                      <div style={{marginTop:'0.8rem',animation:'wa-fadeUp 0.15s ease',display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                        <input type="datetime-local" className="input-control" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)} min={new Date().toISOString().slice(0,16)} style={{fontSize:'0.78rem',width:'100%'}}/>
                        <span style={{fontSize:'0.63rem',color:'rgba(255,255,255,0.3)'}}>A campanha ficará na fila do servidor e começará a rodar sozinha na data marcada.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* COLUNA 2: PREVIEW E ESTIMATIVAS */}
                <div style={{display:'flex',flexDirection:'column',background:'#0b141a',borderRadius:'12px',border:'1px solid rgba(255,255,255,0.06)',overflow:'hidden',position:'sticky',top:'0.5rem',boxShadow:'0 10px 30px rgba(0,0,0,0.5)'}}>
                  <div style={{background:'#202c33',padding:'0.75rem 1rem',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.65rem'}}>
                      <Smartphone size={18} color="#25d366"/>
                      <div>
                        <div style={{fontSize:'0.8rem',fontWeight:700,color:'white'}}>Visualização do Cliente</div>
                        <div style={{fontSize:'0.62rem',color:'#94a3b8'}}>Simulação em tempo real</div>
                      </div>
                    </div>
                    {templates.length > 0 && (
                      <button
                        type="button"
                        onClick={regeneratePreview}
                        className="btn btn-secondary"
                        style={{padding:'0.25rem 0.6rem',fontSize:'0.65rem',display:'flex',alignItems:'center',gap:'0.3rem',background:'rgba(255,255,255,0.06)'}}
                        title="Sortear outra variação de texto"
                      >
                        <Shuffle size={11}/>
                        <span>Nova Variação</span>
                      </button>
                    )}
                  </div>

                  <div style={{flex:1,padding:'1.2rem',display:'flex',flexDirection:'column',gap:'0.75rem',backgroundImage:'radial-gradient(circle,rgba(255,255,255,0.015) 1px,transparent 1px)',backgroundSize:'16px 16px',backgroundColor:'#0b141a',minHeight:'240px',overflowY:'auto'}}>
                    {(() => {
                      const curTmpl = templates.find(t => t.id === templateId) || templates[0];
                      if (!curTmpl) {
                        return (
                          <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'rgba(255,255,255,0.3)',fontSize:'0.75rem',textAlign:'center',padding:'2rem'}}>
                            Selecione um template de mensagem para ver a simulação da entrega aqui.
                          </div>
                        );
                      }

                      return (
                        <>
                          {/* Se o template possui Proteção Hook (2 etapas) */}
                          {curTmpl.enableHook && (
                            <>
                              <div style={{alignSelf:'flex-start',maxWidth:'92%',background:'#005c4b',color:'white',padding:'0.55rem 0.85rem',borderRadius:'0 8px 8px 8px',fontSize:'0.78rem',lineHeight:1.4,boxShadow:'0 1px 2px rgba(0,0,0,0.3)',animation:'wa-fadeUp 0.15s ease'}}>
                                <div style={{fontSize:'0.6rem',color:'#34d399',fontWeight:700,marginBottom:'0.2rem',textTransform:'uppercase',letterSpacing:'0.04em'}}>
                                  1️⃣ Saudação Inicial (Anti-Ban)
                                </div>
                                <div>{curTmpl.hookMessage || 'Olá, tudo bem? Posso te passar uma informação rápida?'}</div>
                                <div style={{display:'flex',justifyContent:'flex-end',fontSize:'0.54rem',color:'rgba(255,255,255,0.4)',marginTop:'3px'}}>
                                  <span>{new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
                                </div>
                              </div>

                              <div style={{alignSelf:'flex-end',maxWidth:'85%',background:'#202c33',color:'#e9edef',padding:'0.5rem 0.75rem',borderRadius:'8px 0 8px 8px',fontSize:'0.76rem',lineHeight:1.35,boxShadow:'0 1px 2px rgba(0,0,0,0.3)'}}>
                                <div style={{fontSize:'0.6rem',color:'#38bdf8',fontWeight:600,marginBottom:'0.15rem'}}>
                                  Cliente (Resposta simulada)
                                </div>
                                <div>Oi! Tudo bem, pode falar 😊</div>
                                <div style={{display:'flex',justifyContent:'flex-end',fontSize:'0.54rem',color:'rgba(255,255,255,0.4)',marginTop:'3px'}}>
                                  <span>{new Date(Date.now() + 12000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
                                </div>
                              </div>
                            </>
                          )}

                          {/* Mensagem Principal (com mídia se houver) */}
                          <div style={{alignSelf:'flex-start',maxWidth:'92%',background:'#005c4b',color:'white',padding:'0.6rem 0.9rem',borderRadius:'0 8px 8px 8px',fontSize:'0.82rem',lineHeight:1.45,boxShadow:'0 1px 2px rgba(0,0,0,0.3)',wordBreak:'break-word',animation:'wa-fadeUp 0.15s ease'}}>
                            {curTmpl.enableHook && (
                              <div style={{fontSize:'0.6rem',color:'#34d399',fontWeight:700,marginBottom:'0.35rem',textTransform:'uppercase',letterSpacing:'0.04em'}}>
                                2️⃣ Mensagem Principal / Oferta
                              </div>
                            )}
                            {curTmpl.imageUrl && (
                              <img src={curTmpl.imageUrl} alt="Mídia da Campanha" style={{borderRadius:'6px',width:'100%',maxHeight:'180px',objectFit:'cover',marginBottom:'0.6rem',border:'1px solid rgba(255,255,255,0.05)'}}/>
                            )}
                            <div style={{whiteSpace:'pre-wrap'}}>{previewText || curTmpl.body}</div>
                            <div style={{display:'flex',justifyContent:'flex-end',fontSize:'0.56rem',color:'rgba(255,255,255,0.4)',marginTop:'4px'}}>
                              <span>{new Date(Date.now() + (curTmpl.enableHook ? 20000 : 0)).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* ESTIMATIVAS E METADADOS */}
                  <div style={{background:'rgba(255,255,255,0.02)',borderTop:'1px solid rgba(255,255,255,0.05)',padding:'1rem'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem',marginBottom:'0.6rem',fontSize:'0.72rem'}}>
                      <div style={{color:'rgba(255,255,255,0.45)',display:'flex',flexDirection:'column',gap:'0.2rem'}}>
                        <span translate="no">⏱️ Delay: <strong style={{color:'#f8fafc'}}>{delayMin} seg – {delayMax} seg</strong></span>
                        <span>🎲 Textos: <strong style={{color:'#34d399'}}>via template</strong></span>
                      </div>
                      <div style={{color:'rgba(255,255,255,0.45)',display:'flex',flexDirection:'column',gap:'0.2rem'}}>
                        <span>☕ Cooldown: <strong style={{color:'#a78bfa'}}>{batchSize>0?`Lote de ${batchSize} msgs`:'Desativado'}</strong></span>
                        <span>🛡️ Risco Ban: <strong style={{color:riskColor}}>{riskLabel}</strong></span>
                      </div>
                    </div>
                    {contactsCount > 0 && est && (
                      <>
                        <div style={{height:'1px',background:'rgba(255,255,255,0.05)',marginBottom:'0.5rem'}}/>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',color:'rgba(255,255,255,0.4)'}}>
                          <span>Total de Contatos: <strong style={{color:'#f8fafc'}}>{contactsCount}</strong></span>
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',color:'rgba(255,255,255,0.4)',marginTop:'0.2rem'}}>
                          <span>Duração Total Estimada:</span>
                          <span style={{fontWeight:700,color:'#10b981'}}>{est.min} ~ {est.max}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

              </div>
              <div className="modal-footer" style={{borderTop:'1px solid rgba(255,255,255,0.08)',padding:'1rem 1.5rem'}}>
                <button type="button" className="btn btn-secondary" onClick={()=>setShowAddCampaign(false)} disabled={isSubmitting}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting||(targetType==='GROUP'&&groups.length===0)||(targetType==='SEGMENT'&&segments.length===0)||templates.length===0} style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
                  {'🚀 Criar Campanha'}
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
