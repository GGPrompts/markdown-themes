import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface MermaidFullscreenProps {
  containerRef: React.RefObject<HTMLElement | null>;
}

let fsCounter = 0;

/**
 * Clones a mermaid SVG for fullscreen display, fixing two issues:
 * 1. Renames the SVG id to avoid duplicates (mermaid scopes all <style> with #id)
 * 2. Replaces percentage width/height with explicit pixel dimensions from viewBox
 *
 * Returns the processed SVG as an HTML string for React to manage.
 */
function prepareSvgHtml(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // Deduplicate ID — mermaid styles are scoped with #mermaid-xxx
  const oldId = clone.getAttribute('id');
  if (oldId) {
    const newId = `${oldId}-fs-${++fsCounter}`;
    clone.setAttribute('id', newId);
    // Update all #oldId references in internal <style> blocks
    clone.querySelectorAll('style').forEach(style => {
      style.textContent = style.textContent!.split(`#${oldId}`).join(`#${newId}`);
    });
    // Update any url(#oldId...) references in attributes (markers, clips, etc.)
    clone.querySelectorAll('[clip-path], [marker-start], [marker-end], [marker-mid], [fill], [mask]').forEach(el => {
      for (const attr of el.attributes) {
        if (attr.value.includes(`url(#${oldId}`)) {
          attr.value = attr.value.split(`url(#${oldId}`).join(`url(#${newId}`);
        }
      }
    });
  }

  // Fix sizing — replace percentage dimensions with viewBox-derived pixels
  const viewBox = clone.getAttribute('viewBox');
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      const [, , vbWidth, vbHeight] = parts;
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      clone.setAttribute('width', String(vbWidth));
      clone.setAttribute('height', String(vbHeight));
    }
  } else {
    // No viewBox — use bounding rect from the live element
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      clone.setAttribute('width', String(Math.round(rect.width)));
      clone.setAttribute('height', String(Math.round(rect.height)));
    }
  }

  // Remove any inline width:100% / height:100% styles
  clone.style.removeProperty('width');
  clone.style.removeProperty('height');
  clone.style.removeProperty('max-width');

  return clone.outerHTML;
}

/**
 * Custom fullscreen handler for Streamdown mermaid blocks.
 *
 * Streamdown's built-in fullscreen renders inline (no portal), so it gets
 * trapped by ancestor overflow-hidden and loses z-index battles with theme
 * pseudo-elements. This component uses a React portal to document.body,
 * escaping all CSS containment issues.
 */
export function MermaidFullscreen({ containerRef }: MermaidFullscreenProps) {
  const [svgHtml, setSvgHtml] = useState<string | null>(null);

  // Pan/zoom via ref to avoid re-renders during drag.
  // React re-renders were wiping manually-appended DOM — now we use
  // dangerouslySetInnerHTML (React-managed) for the SVG, and a ref
  // for the transform to avoid triggering re-renders during drag.
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  function applyTransform() {
    if (!contentRef.current) return;
    const { x, y, scale } = transformRef.current;
    contentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }

  const openFullscreen = useCallback((mermaidBlock: HTMLElement) => {
    const svg = mermaidBlock.querySelector('svg[id^="mermaid-"]');
    if (!svg) return;
    transformRef.current = { x: 0, y: 0, scale: 1 };
    setSvgHtml(prepareSvgHtml(svg as SVGSVGElement));
  }, []);

  const closeFullscreen = useCallback(() => {
    setSvgHtml(null);
  }, []);

  // Escape key to close
  useEffect(() => {
    if (!svgHtml) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFullscreen();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [svgHtml, closeFullscreen]);

  // Pointer events — direct DOM updates via ref, no React re-renders
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button')) return;
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: transformRef.current.x,
        startTy: transformRef.current.y,
      };
      overlay!.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragRef.current) return;
      transformRef.current = {
        ...transformRef.current,
        x: dragRef.current.startTx + (e.clientX - dragRef.current.startX),
        y: dragRef.current.startTy + (e.clientY - dragRef.current.startY),
      };
      applyTransform();
    }

    function onPointerUp(e: PointerEvent) {
      dragRef.current = null;
      // Close on click (not drag): only if barely moved and target is backdrop
      const down = mouseDownPosRef.current;
      if (down) {
        const dist = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
        mouseDownPosRef.current = null;
        if (dist < 5 && e.target === overlay) {
          closeFullscreen();
        }
      }
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      transformRef.current = {
        ...transformRef.current,
        scale: Math.min(Math.max(transformRef.current.scale * factor, 0.1), 10),
      };
      applyTransform();
    }

    overlay.addEventListener('pointerdown', onPointerDown);
    overlay.addEventListener('pointermove', onPointerMove);
    overlay.addEventListener('pointerup', onPointerUp);
    overlay.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      overlay.removeEventListener('pointerdown', onPointerDown);
      overlay.removeEventListener('pointermove', onPointerMove);
      overlay.removeEventListener('pointerup', onPointerUp);
      overlay.removeEventListener('wheel', onWheel);
    };
  }, [svgHtml, closeFullscreen]);

  // Zoom button handlers — update ref + apply
  const zoomIn = useCallback(() => {
    transformRef.current = { ...transformRef.current, scale: Math.min(transformRef.current.scale * 1.25, 10) };
    applyTransform();
  }, []);
  const zoomOut = useCallback(() => {
    transformRef.current = { ...transformRef.current, scale: Math.max(transformRef.current.scale * 0.8, 0.1) };
    applyTransform();
  }, []);
  const zoomReset = useCallback(() => {
    transformRef.current = { x: 0, y: 0, scale: 1 };
    applyTransform();
  }, []);

  // Observe container for mermaid blocks and inject fullscreen buttons
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const BUTTON_ATTR = 'data-mermaid-fs-injected';

    function injectButtons() {
      const blocks = container!.querySelectorAll('[data-streamdown="mermaid-block"]');
      blocks.forEach(block => {
        const toolbar = block.querySelector(':scope > div.flex');
        if (!toolbar) return;
        if (toolbar.querySelector(`[${BUTTON_ATTR}]`)) return;

        const btn = document.createElement('button');
        btn.setAttribute(BUTTON_ATTR, '');
        btn.className = 'mermaid-fs-button cursor-pointer p-1 text-muted-foreground transition-all hover:text-foreground';
        btn.title = 'View fullscreen';
        btn.type = 'button';
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openFullscreen(block as HTMLElement);
        });
        toolbar.appendChild(btn);
      });
    }

    injectButtons();
    const observer = new MutationObserver(injectButtons);
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [containerRef, openFullscreen]);

  if (!svgHtml) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="mermaid-fullscreen-overlay"
    >
      {/* Close button */}
      <button
        className="mermaid-fs-close"
        onClick={closeFullscreen}
        title="Exit fullscreen"
        type="button"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18" /><path d="M6 6l12 12" />
        </svg>
      </button>

      {/* Zoom controls */}
      <div className="mermaid-fs-controls">
        <button onClick={zoomIn} title="Zoom in" type="button">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M11 8v6" /><path d="M8 11h6" />
          </svg>
        </button>
        <button onClick={zoomOut} title="Zoom out" type="button">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /><path d="M8 11h6" />
          </svg>
        </button>
        <button onClick={zoomReset} title="Reset zoom" type="button">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
          </svg>
        </button>
      </div>

      {/* SVG content with pan/zoom — React-managed to survive re-renders */}
      <div
        ref={contentRef}
        className="mermaid-fs-content"
        dangerouslySetInnerHTML={{ __html: svgHtml }}
      />
    </div>,
    document.body
  );
}
