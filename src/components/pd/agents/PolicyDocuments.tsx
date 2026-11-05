import { useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, Paperclip, Pencil, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TextInput, TextArea, Select } from '@/components/pd/form';
import type { PolicyDoc } from '@/lib/pd/agents/domain';
import { savePolicyDocument } from '@/lib/pd/agents/store';
import { toast } from 'sonner';

function fileBlob(doc: PolicyDoc): Blob | null {
  if (!doc.dataUrl) return null;
  const base64 = doc.dataUrl.split(',')[1];
  if (!base64) return null;
  return new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type: doc.mimeType || 'application/octet-stream' });
}

export function PolicyDocuments({ agentId, sectionKey, docs }: { agentId: string; sectionKey: string; docs: PolicyDoc[] }) {
  const [edit, setEdit] = useState<{ original: string | null; draft: PolicyDoc } | null>(null);
  const [preview, setPreview] = useState<PolicyDoc | null>(null);
  const [remove, setRemove] = useState<PolicyDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    setText(''); setPreviewUrl('');
    if (!preview) return;
    const blob = fileBlob(preview);
    if (!blob) return;
    const url = URL.createObjectURL(blob); setPreviewUrl(url);
    let active = true;
    if (preview.mimeType?.startsWith('text/')) void blob.text().then(v => { if (active) setText(v); });
    return () => { active = false; URL.revokeObjectURL(url); };
  }, [preview]);

  async function readFile(file: File) {
    if (!edit) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Choose a file smaller than 2 MB.'); return; }
    if (!/\.(pdf|docx?|xlsx?|txt|csv|png|jpe?g|webp)$/i.test(file.name)) { toast.error('Choose a PDF, Office document, text file or image.'); return; }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read file.')); reader.onerror = () => reject(new Error('Could not read file.')); reader.readAsDataURL(file);
      });
      setEdit(v => v ? { ...v, draft: { ...v.draft, name: v.draft.name || file.name.replace(/\.[^.]+$/, ''), file: file.name, dataUrl, mimeType: file.type, size: file.size } } : v);
    } catch { toast.error('Could not read the file. Try again.'); }
    finally { setBusy(false); }
  }

  function download(doc: PolicyDoc) {
    const blob = fileBlob(doc); if (!blob) return;
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = doc.file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  return <div className="mt-3 space-y-2">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted-foreground">Documents{docs.length ? ` · ${docs.length}` : ''}</span>
      <Button variant="ghost" size="sm" onClick={() => setEdit({ original: null, draft: { name: '', type: 'Reference', file: '', instruction: '', when: '' } })}><Paperclip className="size-3.5" />Add document</Button>
    </div>
    {docs.map(doc => <div key={doc.file} className="flex min-w-0 items-center gap-2 border-b border-border pb-2 last:border-0">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <Button variant="ghost" className="h-auto min-w-0 flex-1 flex-col items-start gap-0 px-1 py-1 text-left" onClick={() => setPreview(doc)} title={doc.name}>
        <span className="w-full truncate text-xs font-medium">{doc.name}</span><span className="w-full truncate text-[11px] text-muted-foreground">{doc.type} · {doc.file}{doc.size ? ` · ${Math.ceil(doc.size / 1024)} KB` : ''}</span>
      </Button>
      <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`View ${doc.name}`} title="View document" onClick={() => setPreview(doc)}><Eye className="size-3.5" /></Button>
      <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label={`Edit ${doc.name}`} title="Edit document" onClick={() => setEdit({ original: doc.file, draft: { ...doc } })}><Pencil className="size-3.5" /></Button>
      <Button variant="destructive-soft" size="icon" className="size-7 shrink-0" aria-label={`Remove ${doc.name}`} title="Remove document" onClick={() => setRemove(doc)}><Trash2 className="size-3.5" /></Button>
    </div>)}
    <Dialog open={!!edit} onOpenChange={open => { if (!open && !busy) setEdit(null); }}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{edit?.original ? 'Edit document' : 'Add document'}</DialogTitle><DialogDescription>Supporting document for this policy section.</DialogDescription></DialogHeader>
      {edit && <form className="space-y-3" onSubmit={e => { e.preventDefault(); try { savePolicyDocument(agentId, sectionKey, edit.original, { ...edit.draft, name: edit.draft.name.trim() }); setEdit(null); toast.success('Document updated.'); } catch (err) { toast.error(err instanceof Error ? err.message : 'Could not save document.'); } }}>
        <div><label className="pd-label" htmlFor="policy-doc-name">Name</label><TextInput id="policy-doc-name" required value={edit.draft.name} onChange={e => setEdit({ ...edit, draft: { ...edit.draft, name: e.target.value } })} /></div>
        <div><label className="pd-label" htmlFor="policy-doc-type">Type</label><Select id="policy-doc-type" value={edit.draft.type} onChange={e => setEdit({ ...edit, draft: { ...edit.draft, type: e.target.value as PolicyDoc['type'] } })}><option>Form</option><option>Reference</option></Select></div>
        <div><label className="pd-label" htmlFor="policy-doc-instruction">Instructions</label><TextArea id="policy-doc-instruction" rows={2} value={edit.draft.instruction} onChange={e => setEdit({ ...edit, draft: { ...edit.draft, instruction: e.target.value } })} /></div>
        <div><label className="pd-label" htmlFor="policy-doc-when">When to use</label><TextInput id="policy-doc-when" value={edit.draft.when} onChange={e => setEdit({ ...edit, draft: { ...edit.draft, when: e.target.value } })} /></div>
        <input ref={input} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp" onChange={e => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }} />
        <div className="flex min-w-0 items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}><Upload className="size-3.5" />{busy ? 'Reading file…' : edit.draft.file ? 'Replace file' : 'Choose file'}</Button><span className="truncate text-xs text-muted-foreground" title={edit.draft.file}>{edit.draft.file || 'No file selected'}</span></div>
        <p className="text-[11px] text-muted-foreground">PDF, Office documents, text or images · Up to 2 MB</p>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button type="submit" disabled={busy || !edit.draft.name.trim() || !edit.draft.file}>Save document</Button></DialogFooter>
      </form>}
    </DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>{preview?.file} · {preview?.type}</DialogDescription></DialogHeader>
      {preview?.instruction && <p className="text-sm">{preview.instruction}</p>}{preview?.when && <p className="text-xs text-muted-foreground">{preview.when}</p>}
      {!preview?.dataUrl ? <p className="border-t border-border pt-3 text-sm text-muted-foreground">This reference document has no file attached. Replace it with your document to view its contents.</p> : preview.mimeType?.startsWith('image/') ? <img src={previewUrl} alt={preview.name} className="max-h-80 w-full object-contain" /> : preview.mimeType?.startsWith('text/') ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary p-3 text-xs">{text}</pre> : <p className="text-sm text-muted-foreground">Download this document to view its contents.</p>}
      <DialogFooter><Button variant="outline" onClick={() => { if (preview) setEdit({ original: preview.file, draft: { ...preview } }); setPreview(null); }}><Pencil className="size-3.5" />Edit document</Button>{preview?.dataUrl && <Button onClick={() => download(preview)}><Download className="size-3.5" />Download</Button>}</DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={!!remove} onOpenChange={open => { if (!open) setRemove(null); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Remove document?</DialogTitle><DialogDescription>{remove?.name} will be removed from this policy section.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setRemove(null)}>Cancel</Button><Button variant="destructive-soft" onClick={() => { if (remove) savePolicyDocument(agentId, sectionKey, remove.file, null); setRemove(null); }}>Remove document</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}