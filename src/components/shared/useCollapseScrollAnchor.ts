import { useEffect } from 'react';

const HEADER_SELECTOR = '.collapsible-header, .collapsible-subsection-header';
const BODY_SELECTOR = ':scope > .collapsible-body, :scope > .collapsible-subsection-body';

/** Nearest scrollable ancestor, i.e. the panel the header lives in. */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Keeps a just-collapsed section/subsection in view.
 *
 * Section and subsection headers are `position: sticky` (top:0 and top:48). When
 * you collapse a block you had scrolled into, its body is removed from the flow,
 * so the unchanged `scrollTop` leaves the viewport parked in unrelated content far
 * below — the scroll appears to jump "somewhere random". When a collapse leaves
 * the clicked header above its sticky anchor, we scroll it back so it sits at that
 * anchor (`scroll-margin-top` reserves room for the pinned section header above a
 * subsection): the thing you collapsed stays exactly where you clicked it, with
 * the following section under it. A collapse whose header is still on screen, and
 * any expand, are left alone.
 *
 * One delegated listener (mounted once) covers every collapsible header — the
 * inline panel sections and the shared CollapsibleSubsection alike.
 */
export function useCollapseScrollAnchor(): void {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const header = (e.target as HTMLElement | null)?.closest(HEADER_SELECTOR) as HTMLElement | null;
      if (!header) return;
      const scroller = getScrollParent(header);
      // The collapsible block whose body is added/removed as a direct child.
      const block = header.parentElement;
      if (!scroller || !block) return;

      // Returns true once the toggle has resolved (so we can stop watching): on a
      // collapse it re-anchors the header if needed; an expand is a no-op.
      const tryAnchor = (): boolean => {
        if (!header.isConnected) return true;
        if (block.querySelector(BODY_SELECTOR)) return false; // still expanded — wait
        const stickyTop = parseFloat(getComputedStyle(header).top) || 0;
        const desiredTop = scroller.getBoundingClientRect().top + stickyTop;
        if (header.getBoundingClientRect().top < desiredTop - 1) {
          // scrollIntoView resolves the target scroll natively (sticky- and
          // scroll-margin-aware), which is more reliable than nudging scrollTop.
          header.scrollIntoView({ block: 'start' });
        }
        return true;
      };

      // The collapse may flush synchronously (handled by the immediate call) or a
      // frame later; a MutationObserver catches the deferred body removal exactly
      // when it lands. Observer callbacks are microtasks, so they always see the
      // settled DOM.
      if (!tryAnchor()) {
        const observer = new MutationObserver(() => {
          if (tryAnchor()) observer.disconnect();
        });
        observer.observe(block, { childList: true });
        // Stop watching if nothing collapses (e.g. an expand, or a non-toggling click).
        setTimeout(() => observer.disconnect(), 500);
      }
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
}
