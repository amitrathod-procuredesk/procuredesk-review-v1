import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function PolicyPdfPreview({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let stopped = false;
    let cleanup = () => {};
    setError('');
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument(url);
        cleanup = () => { void task.destroy(); };
        const pdf = await task.promise;
        if (stopped) return;
        setCount(pdf.numPages);
        const pdfPage = await pdf.getPage(page);
        const el = canvas.current;
        if (stopped || !el) return;
        const viewport = pdfPage.getViewport({ scale: 1.5 });
        el.width = viewport.width; el.height = viewport.height;
        await pdfPage.render({ canvas: el, viewport }).promise;
      } catch { if (!stopped) setError('Preview unavailable. Download the document to view it.'); }
    })();
    return () => { stopped = true; cleanup(); };
  }, [url, page]);
  return <div className="space-y-2">
    {error ? <p className="text-sm text-muted-foreground">{error}</p> : <div className="max-h-80 overflow-y-auto border border-border"><canvas ref={canvas} className="h-auto w-full" aria-label={`Document page ${page}`} /></div>}
    {count > 1 && <div className="flex items-center justify-center gap-2"><Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4" /></Button><span className="text-xs text-muted-foreground">{page} of {count}</span><Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= count} onClick={() => setPage(p => p + 1)}><ChevronRight className="size-4" /></Button></div>}
  </div>;
}