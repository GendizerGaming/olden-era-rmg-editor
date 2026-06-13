import React, { useRef, useState, useEffect } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useTranslation } from '../i18n/context';
import { biomeColors } from '../constants/biomes';
import { Link, Trash2, RotateCcw, Undo, Redo, Grid, Plus, Eye, EyeOff, ZoomIn, ZoomOut, Focus, Unlock, List, Scale, CopyPlus } from 'lucide-react';
import type { Zone, Edge } from '../types/editor';
import { playerColors, clamp, formatGuardValue, pairBend, connectionPath } from './canvas/helpers';
import { WelcomeOverlay } from './WelcomeOverlay';
import { edgePairKey } from '../store/zones';

/**
 * Vector glyphs for the main-object badges, drawn in a ±5 box around the
 * origin. Emoji rendered too small and fuzzy at badge size to tell a castle
 * from a tent.
 */
function mainObjectBadgeIcon(type: string): React.ReactNode {
  switch (type) {
    case 'AbandonedOutpost':
      // A tent: triangle with a door notch
      return (
        <path
          d="M -4.6 4.4 L 0 -4.6 L 4.6 4.4 Z M -1.4 4.4 L 0 1.2 L 1.4 4.4 Z"
          fill="#ffffff"
          fillRule="evenodd"
        />
      );
    case 'GladiatorArena':
      // Crossed swords with crossguards
      return (
        <g stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" fill="none">
          <path d="M -3.8 -3.8 L 3.8 3.8 M 3.8 -3.8 L -3.8 3.8" />
          <path d="M -4.3 -2.1 L -2.1 -4.3 M 2.1 -4.3 L 4.3 -2.1" />
        </g>
      );
    default:
      // A castle: crenellated wall with an arched gate
      return (
        <path
          d="M -4.8 4.8 L -4.8 -4.4 L -2.9 -4.4 L -2.9 -2 L -1 -2 L -1 -4.4 L 1 -4.4 L 1 -2 L 2.9 -2 L 2.9 -4.4 L 4.8 -4.4 L 4.8 4.8 Z M -1.3 4.8 L -1.3 1.8 Q 0 0.5 1.3 1.8 L 1.3 4.8 Z"
          fill="#ffffff"
          fillRule="evenodd"
        />
      );
  }
}

export const Canvas: React.FC = () => {
  const { t } = useTranslation();
  const zones = useEditorStore((state) => state.zones);
  const edges = useEditorStore((state) => state.edges);
  const selected = useEditorStore((state) => state.selected);
  const mode = useEditorStore((state) => state.mode);
  const connectStart = useEditorStore((state) => state.connectStart);
  const snapToGrid = useEditorStore((state) => state.snapToGrid);
  const { sizeX, sizeZ, originalZoneLayouts } = useEditorStore((state) => state.settings);
  const past = useEditorStore((state) => state.history.past);
  const future = useEditorStore((state) => state.history.future);
  const actions = useEditorStore((state) => state.actions);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragInfo, setDragInfo] = useState<{ zoneId: string; dx: number; dy: number } | null>(null);
  const dragCoordsRef = useRef<{ x: number; y: number } | null>(null);

  // Zoom and Pan States
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // Semantic zoom: the space scales fully, zone glyphs only with √zoom
  // (zooming in spreads the zones apart instead of inflating them), and the
  // guard badges keep a constant screen size. Zoom is clamped to >= 1.
  const zoneK = 1 / Math.sqrt(zoom);
  const badgeK = 1 / zoom;
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [showProximity, setShowProximity] = useState<boolean>(true);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const scrollStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [squareSide, setSquareSide] = useState<number>(0);
  const [wrapperHeight, setWrapperHeight] = useState<number>(0);

  // Map content is laid out inside a fixed 1000x1000 square viewBox. The SVG
  // element itself is sized as the largest centred square via CSS, so the
  // working area stays square regardless of the panel's aspect ratio.
  const BASE_SIZE = 912;
  const BASE_OFFSET = 44;

  const ratio = sizeX / sizeZ;
  let w = BASE_SIZE;
  let h = BASE_SIZE;
  let xOffset = BASE_OFFSET;
  let yOffset = BASE_OFFSET;

  if (ratio >= 1) {
    w = BASE_SIZE;
    h = BASE_SIZE / ratio;
    xOffset = BASE_OFFSET;
    yOffset = BASE_OFFSET + (BASE_SIZE - h) / 2;
  } else {
    h = BASE_SIZE;
    w = BASE_SIZE * ratio;
    yOffset = BASE_OFFSET;
    xOffset = BASE_OFFSET + (BASE_SIZE - w) / 2;
  }

  // Clamp panning so the working area always covers the viewport (no gaps
  // outside the map can appear, and the map cannot be dragged off-screen).
  const clampPan = (p: { x: number; y: number }, z: number) => {
    const minX = (xOffset + w) * (1 - z);
    const maxX = xOffset * (1 - z);
    const minY = (yOffset + h) * (1 - z);
    const maxY = yOffset * (1 - z);
    return {
      x: Math.min(maxX, Math.max(minX, p.x)),
      y: Math.min(maxY, Math.max(minY, p.y))
    };
  };

  // SVG coordinate conversions
  const toCanvas = (z: { x: number; y: number }) => {
    return {
      x: xOffset + z.x * w,
      y: yOffset + z.y * h
    };
  };

  const getLocalPointer = React.useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 500, y: 500 };
    const rect = svgRef.current.getBoundingClientRect();
    const localX = ((clientX - rect.left) / rect.width) * 1000;
    const localY = ((clientY - rect.top) / rect.height) * 1000;
    return { x: localX, y: localY };
  }, []);

  const fromPointer = React.useCallback((clientX: number, clientY: number) => {
    const local = getLocalPointer(clientX, clientY);
    return {
      x: ((local.x - pan.x) / zoom - xOffset) / w,
      y: ((local.y - pan.y) / zoom - yOffset) / h
    };
  }, [getLocalPointer, h, pan.x, pan.y, w, xOffset, yOffset, zoom]);

  const formatGuardLabel = React.useCallback((edge: Edge) => {
    if (edge.connectionType === 'Proximity') {
      const lengthVal = edge.length ?? 0.1;
      if (lengthVal <= 0.1) return t('proximitySnap');
      if (lengthVal <= 0.5) return t('proximityClose');
      if (lengthVal <= 1.5) return t('proximityMedium');
      if (lengthVal <= 4.0) return t('proximityFar');
      return t('proximityVeryFar');
    }
    return formatGuardValue(edge.guardValue);
  }, [t]);

  // Biome resolver
  const getZoneActiveBiome = (zone: Zone): string => {
    if (zone.biomeMode === 'specific') {
      const bId = zone.biomeId ? zone.biomeId.toLowerCase() : 'random';
      if (bId === 'grass') return 'grass';
      if (bId === 'deathland') return 'wasteland';
      if (bId === 'dirt') return 'dirt';
      if (bId === 'autumn') return 'highlands';
      if (bId === 'snow') return 'snow';
      if (bId === 'lava') return 'lava';
      if (bId === 'sand') return 'sand';
      return bId;
    }
    return 'random';
  };

  // Size the canvas as the largest square that fits the panel while leaving
  // room for the side toolbars and a small top/bottom margin.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // 38px toolbar button + 14px gap on each side of it, per side
    const SIDE_RESERVE = 66;
    const VERTICAL_MARGIN = 0;
    const update = () => {
      const side = Math.min(
        el.clientWidth - SIDE_RESERVE * 2,
        el.clientHeight - VERTICAL_MARGIN * 2
      );
      setSquareSide(Math.max(0, Math.round(side)));
      setWrapperHeight(el.clientHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Spacebar panning key listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+0: reset zoom & pan (overrides the browser page-zoom reset)
      if ((e.ctrlKey || e.metaKey) && (e.code === 'Digit0' || e.code === 'Numpad0')) {
        e.preventDefault();
        setZoom(1);
        setPan({ x: 0, y: 0 });
        return;
      }
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    const handleBlur = () => {
      setIsSpacePressed(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const resetZoomAndPan = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = () => {
    const nextZoom = Math.min(8, zoom * 1.2);
    if (nextZoom === zoom) return;
    const ratio = nextZoom / zoom;
    setPan(p => clampPan({
      x: 500 * (1 - ratio) + p.x * ratio,
      y: 500 * (1 - ratio) + p.y * ratio
    }, nextZoom));
    setZoom(nextZoom);
  };

  const zoomOut = () => {
    const nextZoom = Math.max(1, zoom / 1.2);
    if (nextZoom === zoom) return;
    const ratio = nextZoom / zoom;
    setPan(p => clampPan({
      x: 500 * (1 - ratio) + p.x * ratio,
      y: 500 * (1 - ratio) + p.y * ratio
    }, nextZoom));
    setZoom(nextZoom);
  };

  // Zooming via Wheel. Attached manually with { passive: false }: React
  // registers wheel listeners as passive, where preventDefault() (needed to
  // keep the page from scrolling while zooming) triggers console errors.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.15;
      const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
      const clampedZoom = Math.max(1, Math.min(8, nextZoom));

      if (clampedZoom === zoom) return;

      const local = getLocalPointer(e.clientX, e.clientY);
      const ratio = clampedZoom / zoom;
      setPan(clampPan({
        x: local.x * (1 - ratio) + pan.x * ratio,
        y: local.y * (1 - ratio) + pan.y * ratio
      }, clampedZoom));
      setZoom(clampedZoom);
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  });

  // Panning via pointer events
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const isMiddle = e.button === 1;
    const isRight = e.button === 2;
    const isSpaceLeft = e.button === 0 && isSpacePressed;
    
    if (isMiddle || isRight || isSpaceLeft) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY
      };
      scrollStartRef.current = {
        x: pan.x,
        y: pan.y
      };
      if (containerRef.current) {
        containerRef.current.setPointerCapture(e.pointerId);
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      e.preventDefault();
      e.stopPropagation();
      const dxScreen = e.clientX - panStartRef.current.x;
      const dyScreen = e.clientY - panStartRef.current.y;
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const dx = (dxScreen / rect.width) * 1000;
        const dy = (dyScreen / rect.height) * 1000;
        setPan(clampPan({
          x: scrollStartRef.current.x + dx,
          y: scrollStartRef.current.y + dy
        }, zoom));
      }
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(false);
      if (containerRef.current) {
        containerRef.current.releasePointerCapture(e.pointerId);
      }
    }
  };

  // Drag event handling
  const handleZonePointerDown = (e: React.PointerEvent<SVGElement>, zone: Zone) => {
    if (mode === 'connect') return;
    // Panning overrides dragging
    if (e.button === 1 || e.button === 2 || isSpacePressed) return;
    e.preventDefault();
    e.stopPropagation();

    const p = fromPointer(e.clientX, e.clientY);
    actions.setSelected({ type: 'zone', id: zone.id });
    setDragInfo({
      zoneId: zone.id,
      dx: zone.x - p.x,
      dy: zone.y - p.y
    });

    if (svgRef.current) {
      svgRef.current.classList.add('dragging');
    }
  };

  // Window-level dragging handlers
  useEffect(() => {
    if (!dragInfo) return;

    const handlePointerMove = (e: PointerEvent) => {
      const p = fromPointer(e.clientX, e.clientY);
      const snapToGrid = useEditorStore.getState().snapToGrid;
      let newX = clamp(p.x + dragInfo.dx, 0.04, 0.96);
      let newY = clamp(p.y + dragInfo.dy, 0.04, 0.96);

      // Re-calculate mapping constants for safe scope resolution
      const { sizeX, sizeZ } = useEditorStore.getState().settings;
      const ratio = sizeX / sizeZ;
      const BASE_SIZE = 912;
      const BASE_OFFSET = 44;
      let w = BASE_SIZE;
      let h = BASE_SIZE;
      let xOffset = BASE_OFFSET;
      let yOffset = BASE_OFFSET;

      if (ratio >= 1) {
        w = BASE_SIZE;
        h = BASE_SIZE / ratio;
        xOffset = BASE_OFFSET;
        yOffset = BASE_OFFSET + (BASE_SIZE - h) / 2;
      } else {
        h = BASE_SIZE;
        w = BASE_SIZE * ratio;
        yOffset = BASE_OFFSET;
        xOffset = BASE_OFFSET + (BASE_SIZE - w) / 2;
      }

      const pCanvas = {
        x: xOffset + newX * w,
        y: yOffset + newY * h
      };

      if (snapToGrid) {
        const gameX = Math.round(newX * sizeX);
        const gameY = Math.round(newY * sizeZ);
        const snappedGameX = clamp(Math.round(gameX / 8) * 8, 0, sizeX);
        const snappedGameY = clamp(Math.round(gameY / 8) * 8, 0, sizeZ);
        newX = snappedGameX / sizeX;
        newY = snappedGameY / sizeZ;
        pCanvas.x = xOffset + newX * w;
        pCanvas.y = yOffset + newY * h;
      }

      dragCoordsRef.current = { x: newX, y: newY };

      // Move the whole zone group (rect, watermark, badges with icons and
      // counters, label, hit area) with one transform. Mirroring the badge
      // layout element-by-element here went stale the moment the layout
      // changed — the group cannot.
      const zone = useEditorStore.getState().zones.find(z => z.id === dragInfo.zoneId);
      const zoneGroup = document.getElementById(`zone-${dragInfo.zoneId}`);
      if (zone && zoneGroup) {
        const originX = xOffset + zone.x * w;
        const originY = yOffset + zone.y * h;
        zoneGroup.setAttribute('transform', `translate(${pCanvas.x - originX}, ${pCanvas.y - originY})`);
      }

      // Update connected edge bundles and springs (mirrors the render layout)
      const edges = useEditorStore.getState().edges;
      const zones = useEditorStore.getState().zones;
      const edgeGroups = new Map<string, typeof edges>();
      edges.forEach((edge) => {
        const key = edgePairKey(edge.from, edge.to);
        if (!edgeGroups.has(key)) edgeGroups.set(key, []);
        edgeGroups.get(key)!.push(edge);
      });

      edgeGroups.forEach((group, pairKey) => {
        const touches = group[0].from === dragInfo.zoneId || group[0].to === dragInfo.zoneId;
        if (!touches) return;
        // Sorted endpoint order — must match the render layout exactly so the
        // bend side stays put while dragging.
        const [idA, idB] = [group[0].from, group[0].to].sort();
        const zonePosOf = (zoneId: string) => {
          if (zoneId === dragInfo.zoneId) return pCanvas;
          const zone = zones.find(z => z.id === zoneId);
          return zone ? { x: xOffset + zone.x * w, y: yOffset + zone.y * h } : null;
        };
        const pa = zonePosOf(idA);
        const pb = zonePosOf(idB);
        if (!pa || !pb) return;

        const obstacles = zones
          .filter(z => z.id !== idA && z.id !== idB)
          .map(z => ({ x: xOffset + z.x * w, y: yOffset + z.y * h }));
        const bend = pairBend(pa, pb, obstacles);

        const passages = group.filter(e => e.connectionType !== 'Proximity');
        const springs = group.filter(e => e.connectionType === 'Proximity');
        const springsVisible = showProximity ? springs.length : 0;
        const hasBoth = passages.length > 0 && springsVisible > 0;
        const bundleShift = hasBoth ? -7.5 : 0;

        if (passages.length > 0) {
          const { d: pathD, mid } = connectionPath(pa, pb, bundleShift, bend);
          const isMulti = passages.length > 1;

          // Mirror the render layout: a multi-connection pair is two
          // parallel lines, a single one sits on the center path.
          const dA = isMulti ? connectionPath(pa, pb, bundleShift - 2.75, bend).d : pathD;
          document.getElementById(`bundle-line-${pairKey}`)?.setAttribute('d', dA);
          if (isMulti) {
            document.getElementById(`bundle-line2-${pairKey}`)?.setAttribute('d', connectionPath(pa, pb, bundleShift + 2.75, bend).d);
          }
          document.getElementById(`bundle-hit-${pairKey}`)?.setAttribute('d', pathD);
          document.getElementById(`bundle-guard-${pairKey}`)?.setAttribute(
            'transform',
            `translate(${mid.x}, ${mid.y}) scale(${badgeK})`
          );
        }

        springs.forEach((edge, springIdx) => {
          const shift = passages.length > 0 ? 7.5 + springIdx * 15 : springIdx * 15;
          const { d: pathD } = connectionPath(pa, pb, shift, bend);
          document.getElementById(`spring-line-${edge.id}`)?.setAttribute('d', pathD);
          document.getElementById(`spring-hit-${edge.id}`)?.setAttribute('d', pathD);
        });
      });
    };

    const handlePointerUp = () => {
      // The drag transform is set outside React — clear it before the store
      // re-renders the zone at its committed position, or it offsets twice.
      document.getElementById(`zone-${dragInfo.zoneId}`)?.removeAttribute('transform');
      if (dragCoordsRef.current) {
        actions.setZonePosition(dragInfo.zoneId, dragCoordsRef.current.x, dragCoordsRef.current.y);
        dragCoordsRef.current = null;
      }
      setDragInfo(null);
      if (svgRef.current) {
        svgRef.current.classList.remove('dragging');
      }
      useEditorStore.getState().actions.updateSettings({});
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.getElementById(`zone-${dragInfo.zoneId}`)?.removeAttribute('transform');
      dragCoordsRef.current = null;
    };
  }, [actions, dragInfo, formatGuardLabel, fromPointer, showProximity, zoneK, badgeK]);

  const handleZoneClick = (e: React.MouseEvent, zone: Zone) => {
    e.stopPropagation();
    if (mode === 'connect') {
      if (!connectStart) {
        actions.setConnectStart(zone.id);
      } else if (connectStart !== zone.id) {
        actions.connectZones(connectStart, zone.id);
      } else {
        actions.setConnectStart(null);
      }
    } else {
      actions.setSelected({ type: 'zone', id: zone.id });
    }
  };

  const handleCanvasClick = () => {
    if (!dragInfo) {
      actions.setSelected(null);
      if (mode === 'connect') {
        actions.setMode('select');
      }
    }
  };

  const handleClear = () => {
    if (zones.length && !confirm(t("confirmClear"))) return;
    actions.clearWorkspace();
  };

  const handleDetach = () => {
    if (window.confirm(t('confirmDetachOriginalLayout'))) {
      actions.detachOriginalLayout();
    }
  };

  const getHintText = () => {
    if (mode === 'connect') {
      return connectStart 
        ? t("connectHintPicked", { zone: connectStart }) 
        : t("connectHintEmpty");
    }
    return "";
  };

  const canvasCursor = isPanning ? 'grabbing' : (isSpacePressed ? 'grab' : 'default');

  const getRulerTicks = (size: number) => {
    const ticks = [];
    const interval = size <= 50 ? 8 : (size <= 100 ? 16 : 32);
    for (let val = 0; val <= size; val += interval) {
      ticks.push(val);
    }
    if (ticks[ticks.length - 1] !== size) {
      if (size - ticks[ticks.length - 1] > interval * 0.3) {
        ticks.push(size);
      } else {
        ticks[ticks.length - 1] = size;
      }
    }
    return ticks;
  };

  const getGridTicks = (size: number) => {
    const ticks = [];
    for (let val = 8; val < size; val += 8) {
      ticks.push(val);
    }
    return ticks;
  };

  const getFontSizeForLabel = (label: string): number => {
    const len = label.length;
    if (len <= 2) return 32;
    if (len <= 4) return 24;
    if (len <= 8) return 16;
    if (len <= 12) return 12;
    return 10;
  };

  const xTicks = getRulerTicks(sizeX).filter(val => val !== 0);
  const zTicks = getRulerTicks(sizeZ).filter(val => val !== 0);

  // Center each floating toolbar in the band between the container edge and
  // the white map frame (not the SVG edge — the frame is inset inside the
  // square viewBox), so the frame-to-button and button-to-edge gaps are
  // always equal. The frame is horizontally centred in the 1000-unit
  // viewBox, so its on-screen inset is (1000 - w) / 2 scaled to pixels;
  // 19px is half the 38px button width.
  const frameInset = ((1000 - w) / 2) * (squareSide / 1000);
  const toolbarOffset = squareSide
    ? `max(8px, calc(25% - ${squareSide / 4 - frameInset / 2 + 19}px))`
    : '16px';

  // Bottom toolbar groups are aligned with the bottom edge of the white map
  // frame, which sits (1000 - h) / 2 viewBox units above the SVG bottom. On
  // small canvases the frame edge climbs towards the vertical centre, so the
  // offset is clamped to keep the bottom groups clear of the centred ones:
  // 260px = the tallest centred group's half (111) + the bottom group (130)
  // + a 12px gap.
  const frameVInset = ((1000 - h) / 2) * (squareSide / 1000);
  const toolbarBottom = squareSide
    ? `${Math.max(16, Math.round(wrapperHeight / 2 - Math.max(squareSide / 2 - frameVInset, 260)))}px`
    : '16px';

  return (
    <section className="canvas-shell">
      <div
        ref={containerRef}
        className="canvas-container-wrapper"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
        onClick={handleCanvasClick}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: canvasCursor }}
      >
        <WelcomeOverlay memoRight={toolbarOffset} />
        {getHintText() ? (
          <div className="canvas-floating-hint">
            {getHintText()}
          </div>
        ) : null}



        {/* Left Toolbar (vertically centered) */}
        <div className="canvas-widget-group left-center" style={{ left: toolbarOffset }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="primary"
            onClick={() => actions.addZone("blank")}
            title={t('addZone')}
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            className={mode === 'connect' ? 'active' : ''}
            onClick={() => actions.setMode(mode === 'connect' ? 'select' : 'connect')}
            title={`${t('connectTitle')} (C)`}
          >
            <Link size={16} />
          </button>
          <button
            type="button"
            onClick={actions.duplicateSelected}
            disabled={!selected || (selected.type !== 'zone' && selected.type !== 'edge')}
            title={`${t('duplicateTitle')} (Ctrl+D)`}
          >
            <CopyPlus size={16} />
          </button>
          <button
            type="button"
            onClick={actions.deleteSelected}
            disabled={!selected}
            title={`${t('deleteTitle')} (Del)`}
            className="danger"
          >
            <Trash2 size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              actions.setSelected({ type: 'elementsList', id: 'all' });
              if (mode === 'connect') actions.setMode('select');
            }}
            title={t('showAllElementsTooltip')}
            className={selected?.type === 'elementsList' ? 'active' : ''}
          >
            <List size={16} />
          </button>
        </div>

        {/* Left Bottom Toolbar: view-mode toggles (aligned with the map frame bottom) */}
        <div className="canvas-widget-group left-bottom" style={{ left: toolbarOffset, bottom: toolbarBottom }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={snapToGrid ? 'active' : ''}
            onClick={actions.toggleSnapToGrid}
            title={t('gridSnapTitle')}
          >
            <Grid size={16} />
          </button>
          <button
            type="button"
            className={showProximity ? 'active' : ''}
            onClick={() => setShowProximity(!showProximity)}
            title={t('toggleProximitySprings')}
          >
            {showProximity ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>

        {/* Right Toolbar (vertically centered) */}
        <div className="canvas-widget-group right-center" style={{ right: toolbarOffset }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={actions.undo}
            disabled={past.length === 0}
            title={`${t('undo')} (Ctrl+Z)`}
          >
            <Undo size={16} />
          </button>
          <button
            type="button"
            onClick={actions.redo}
            disabled={future.length === 0}
            title={`${t('redo')} (Ctrl+Y)`}
          >
            <Redo size={16} />
          </button>
          <button type="button" onClick={zoomIn} title={t('zoomIn')}>
            <ZoomIn size={16} />
          </button>
          <button type="button" onClick={zoomOut} title={t('zoomOut')}>
            <ZoomOut size={16} />
          </button>
          <button type="button" onClick={resetZoomAndPan} title={`${t('resetZoom')} (Ctrl+0)`}>
            <Focus size={16} />
          </button>
        </div>

        {/* Right Bottom Toolbar: rare destructive actions (aligned with the map frame bottom) */}
        <div className="canvas-widget-group right-bottom" style={{ right: toolbarOffset, bottom: toolbarBottom }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('confirmRescaleAllZones'))) {
                actions.rescaleZoneValues();
              }
            }}
            title={t('rescaleAllZonesTooltip')}
            className="warning-button"
          >
            <Scale size={16} />
          </button>
          <button
            type="button"
            onClick={handleClear}
            title={t('newBlankTitle')}
            className="danger-button"
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={handleDetach}
            disabled={originalZoneLayouts === undefined}
            title={t('detachOriginalLayoutTooltip')}
            className={originalZoneLayouts !== undefined ? 'warning-button' : ''}
          >
            <Unlock size={16} />
          </button>
        </div>

        <svg
          ref={svgRef}
          id="mapCanvas"
          role="img"
          aria-label="Map template graph"
          viewBox="0 0 1000 1000"
          style={{ width: squareSide || '100%', height: squareSide || '100%' }}
        >
          <defs>
            <pattern id="gridPattern" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="var(--map-grid-stroke)" strokeWidth="1" />
            </pattern>
            <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#1d1a14" floodOpacity="0.18" />
            </filter>
            
            {/* Clip path for the inside of the map frame */}
            <clipPath id="mapFrameClip">
              <rect x={xOffset} y={yOffset} width={w} height={h} rx="4" />
            </clipPath>

            {/* Clip paths for the rulers. Extended by 16 units past the frame
                so edge labels (centred exactly on the frame corner) are not
                cut in half, while panned-away labels still get clipped. */}
            <clipPath id="xRulerClip">
              <rect x={xOffset - 16} y={0} width={w + 32} height={yOffset} />
            </clipPath>
            <clipPath id="zRulerClip">
              <rect x={0} y={yOffset - 16} width={xOffset} height={h + 32} />
            </clipPath>
          </defs>
          
          {/* Background elements */}
          <rect className="canvas-bg" x="0" y="0" width="1000" height="1000" />
          
          {/* Fixed Map Frame Background (White area) */}
          <rect className="map-frame" x={xOffset} y={yOffset} width={w} height={h} rx="4" />
          
          {/* Zoom & Pan Group, Clipped to the Map Frame */}
          <g clipPath="url(#mapFrameClip)">
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Game Coordinate Grid Lines (Denser, every 8 units) */}
              {/* Vertical lines */}
              {getGridTicks(sizeX).map(val => {
                const tx = xOffset + (val / sizeX) * w;
                return (
                  <line
                    key={`xgrid-${val}`}
                    x1={tx}
                    y1={0}
                    x2={tx}
                    y2={1000}
                    className="ruler-grid-line"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {/* Horizontal lines */}
              {getGridTicks(sizeZ).map(val => {
                const ty = yOffset + (val / sizeZ) * h;
                return (
                  <line
                    key={`zgrid-${val}`}
                    x1={0}
                    y1={ty}
                    x2={1000}
                    y2={ty}
                    className="ruler-grid-line"
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}

              {/* Connection layer: one bundle line per zone pair for passage
                  connections plus (at most) one separate spring line. Badges
                  render in a separate layer above every line so no connection
                  can strike through a capsule. When both a bundle and a spring
                  are visible they are offset symmetrically around the centre
                  line between the zones. */}
              {(() => {
                const edgeGroups = new Map<string, Edge[]>();
                edges.forEach((edge) => {
                  const key = edgePairKey(edge.from, edge.to);
                  if (!edgeGroups.has(key)) {
                    edgeGroups.set(key, []);
                  }
                  edgeGroups.get(key)!.push(edge);
                });

                const lineNodes: React.ReactNode[] = [];
                const badgeNodes: React.ReactNode[] = [];

                [...edgeGroups.entries()].forEach(([pairKey, group]) => {
                  // Stable (sorted) endpoint order keeps the perpendicular
                  // direction — and so the bend side — independent of which
                  // edge happens to be first in the group.
                  const [idA, idB] = [group[0].from, group[0].to].sort();
                  const a = zones.find((z) => z.id === idA);
                  const b = zones.find((z) => z.id === idB);
                  if (!a || !b) return;

                  const pa = toCanvas(a);
                  const pb = toCanvas(b);
                  const passages = group.filter((e) => e.connectionType !== 'Proximity');
                  const springs = showProximity
                    ? group.filter((e) => e.connectionType === 'Proximity')
                    : [];

                  // Bend into an arc when the straight segment would pass
                  // through another zone (e.g. a spawn-to-spawn link running
                  // straight through the centre zone).
                  const obstacles = zones
                    .filter((z) => z.id !== idA && z.id !== idB)
                    .map(toCanvas);
                  const bend = pairBend(pa, pb, obstacles);

                  const hasBoth = passages.length > 0 && springs.length > 0;
                  const bundleShift = hasBoth ? -7.5 : 0;
                  // Narrow hit areas when the bundle and the spring run side by
                  // side (15px apart), otherwise the later-drawn hit path would
                  // cover the other line and steal its clicks.
                  const hitWidth = hasBoth ? 14 : 36;

                  const isPairSelected = selected?.type === 'edgePair' && selected.id === pairKey;

                  if (passages.length > 0) {
                    const { d: bundlePath, mid: bundleMid } = connectionPath(pa, pb, bundleShift, bend);
                    const cx_mid = bundleMid.x;
                    const cy_mid = bundleMid.y;
                    // A pair holding several connections is drawn as a double
                    // line — visible even before reading the ×N badge.
                    const isMulti = passages.length > 1;
                    const linePathA = isMulti ? connectionPath(pa, pb, bundleShift - 2.75, bend).d : bundlePath;
                    const linePathB = isMulti ? connectionPath(pa, pb, bundleShift + 2.75, bend).d : null;

                    const isBundleSelected =
                      isPairSelected ||
                      (selected?.type === 'edge' && passages.some((e) => e.id === selected.id));
                    // Color by connection type; a mixed pair stays neutral —
                    // the filled ×N badge already says "open the list".
                    const uniformType = passages.every((e) => e.connectionType === passages[0].connectionType)
                      ? passages[0].connectionType
                      : null;
                    const typeClass = uniformType === 'Portal'
                      ? 'type-portal'
                      : uniformType === 'GladiatorArena'
                        ? 'type-arena'
                        : uniformType === 'Direct'
                          ? 'type-direct'
                          : '';
                    const bundleLabel =
                      passages.length === 1
                        ? formatGuardLabel(passages[0])
                        : `×${passages.length}`;
                    const bundleRectW = bundleLabel.length * 8 + 14;

                    lineNodes.push(
                      <g key={pairKey}>
                        <path
                          id={`bundle-hit-${pairKey}`}
                          className="edge-hit"
                          d={bundlePath}
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.01)"
                          strokeWidth={hitWidth}
                          pointerEvents="stroke"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (passages.length === 1) {
                              actions.setSelected({ type: 'edge', id: passages[0].id });
                            } else {
                              actions.setSelected({ type: 'edgePair', id: pairKey });
                            }
                            if (mode === 'connect') actions.setMode('select');
                          }}
                        />

                        <path
                          id={`bundle-line-${pairKey}`}
                          className={`edge-line ${typeClass} ${isBundleSelected ? 'selected' : ''}`}
                          d={linePathA}
                          fill="none"
                        />
                        {linePathB && (
                          <path
                            id={`bundle-line2-${pairKey}`}
                            className={`edge-line ${typeClass} ${isBundleSelected ? 'selected' : ''}`}
                            d={linePathB}
                            fill="none"
                          />
                        )}
                      </g>
                    );

                    badgeNodes.push(
                      <g
                        key={pairKey}
                        id={`bundle-guard-${pairKey}`}
                        className={`guard-badge-group${passages.length > 1 ? ' count' : ''}`}
                        transform={`translate(${cx_mid}, ${cy_mid}) scale(${badgeK})`}
                        style={{ pointerEvents: 'none' }}
                      >
                        <rect
                          className="guard-badge-bg"
                          x={-bundleRectW / 2}
                          y={-11}
                          width={bundleRectW}
                          height={22}
                          rx={6}
                        />
                        <text className="guard-label" x={0} y={0.5}>
                          {bundleLabel}
                        </text>
                      </g>
                    );
                  }

                  springs.forEach((edge, springIdx) => {
                    const shift = passages.length > 0 ? 7.5 + springIdx * 15 : springIdx * 15;
                    const { d: springPath } = connectionPath(pa, pb, shift, bend);
                    const isSpringSelected =
                      isPairSelected ||
                      (selected?.type === 'edge' && selected.id === edge.id);

                    // No badge for springs: the dashed orange line is
                    // distinctive enough, the behavior lives in the inspector.
                    lineNodes.push(
                      <g key={edge.id}>
                        <path
                          id={`spring-hit-${edge.id}`}
                          className="edge-hit"
                          d={springPath}
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.01)"
                          strokeWidth={hitWidth}
                          pointerEvents="stroke"
                          onClick={(e) => {
                            e.stopPropagation();
                            actions.setSelected({ type: 'edge', id: edge.id });
                            if (mode === 'connect') actions.setMode('select');
                          }}
                        />
                        <path
                          id={`spring-line-${edge.id}`}
                          className={`edge-line proximity ${isSpringSelected ? 'selected' : ''}`}
                          d={springPath}
                          fill="none"
                        />
                      </g>
                    );
                  });
                });

                return (
                  <>
                    <g id="edgeLayer">{lineNodes}</g>
                    <g id="edgeBadgeLayer">{badgeNodes}</g>
                  </>
                );
              })()}
              
              {/* Zone Layer */}
              <g id="zoneLayer">
                {zones.map((zone) => {
                  const p = toCanvas(zone);
                  const isZoneSelected = selected?.type === 'zone' && selected.id === zone.id;
                  const isConnectStart = connectStart === zone.id;
                  const biomeId = getZoneActiveBiome(zone);
                  const labelStr = zone.label || zone.id;

                  const renderMainObjectBadges = () => {
                    const list = zone.mainObjects || [];
                    if (!list.length) return null;
                    const r = 12.5 * zoneK;

                    // Spawns stay individual (the player number matters);
                    // everything else collapses into one badge per type and
                    // owner color with a ×N counter, so a zone with a pile of
                    // cities reads as one castle icon instead of a mess.
                    interface BadgeItem {
                      key: string;
                      color: string;
                      type: string;
                      count: number;
                      player?: number | null;
                    }
                    const items: BadgeItem[] = [];
                    const groups = new Map<string, BadgeItem>();
                    list.forEach((obj, idx) => {
                      if (obj.type === 'Spawn') {
                        items.push({
                          key: obj.key || `spawn-${idx}`,
                          color: playerColors[obj.player || 1] || '#8e8e93',
                          type: 'Spawn',
                          count: 1,
                          player: obj.player
                        });
                        return;
                      }
                      const color = obj.player ? (playerColors[obj.player] || '#8e8e93')
                        : obj.owner ? (playerColors[obj.owner] || '#8e8e93')
                        : '#545456';
                      const groupKey = `${obj.type}:${color}`;
                      const existing = groups.get(groupKey);
                      if (existing) {
                        existing.count += 1;
                      } else {
                        const item: BadgeItem = { key: groupKey, color, type: obj.type, count: 1 };
                        groups.set(groupKey, item);
                        items.push(item);
                      }
                    });

                    const gap = 4 * zoneK;
                    const countWidth = (item: BadgeItem) =>
                      item.count > 1 ? (4 + 9.5 * `×${item.count}`.length) * zoneK : 0;
                    const widths = items.map((item) => 2 * r + countWidth(item));
                    const total = widths.reduce((acc, width) => acc + width, 0) + gap * (items.length - 1);
                    let cursor = p.x - total / 2;
                    const y = p.y - 42 * zoneK;

                    return items.map((item, idx) => {
                      const cx = cursor + r;
                      cursor += widths[idx] + gap;
                      return (
                        <g key={item.key}>
                          <circle
                            id={`zone-badge-circle-${zone.id}-${idx}`}
                            cx={cx}
                            cy={y}
                            r={r}
                            fill={item.color}
                            stroke="#ffffff"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                          />
                          {item.type === 'Spawn' ? (
                            <text
                              id={`zone-badge-text-${zone.id}-${idx}`}
                              x={cx}
                              y={y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize={`${13 * zoneK}px`}
                              fontWeight="800"
                              fill="#ffffff"
                              fontFamily="'Outfit', system-ui, sans-serif"
                            >
                              {item.player || 1}
                            </text>
                          ) : (
                            <g transform={`translate(${cx}, ${y}) scale(${1.45 * zoneK})`} pointerEvents="none">
                              {mainObjectBadgeIcon(item.type)}
                            </g>
                          )}
                          {item.count > 1 && (
                            <text
                              x={cx + r + 2.5 * zoneK}
                              y={y}
                              textAnchor="start"
                              dominantBaseline="middle"
                              fontSize={`${15 * zoneK}px`}
                              fontWeight="900"
                              fontFamily="'Outfit', system-ui, sans-serif"
                              fill="#ffffff"
                              stroke="rgba(15, 13, 9, 0.85)"
                              strokeWidth={3.5 * zoneK}
                              strokeLinejoin="round"
                              paintOrder="stroke"
                            >
                              {`×${item.count}`}
                            </text>
                          )}
                        </g>
                      );
                    });
                  };

                  const hasCastles = (zone.mainObjects || []).length > 0;

                  return (
                    <g key={zone.id} id={`zone-${zone.id}`}>
                      {/* Zone rounded square with flat biome fill & outlines */}
                      <rect
                        id={`zone-circle-${zone.id}`}
                        className={`zone-circle ${isZoneSelected || isConnectStart ? 'selected' : ''}`}
                        x={p.x - 42 * zoneK}
                        y={p.y - 42 * zoneK}
                        width={84 * zoneK}
                        height={84 * zoneK}
                        rx={(hasCastles ? 10 : 42) * zoneK}
                        ry={(hasCastles ? 10 : 42) * zoneK}
                        fill={biomeColors[biomeId] || biomeColors.random}
                        stroke={isZoneSelected || isConnectStart ? 'var(--accent-light)' : 'var(--zone-circle-stroke)'}
                        strokeWidth={isZoneSelected || isConnectStart ? 5 : 2.5}
                        vectorEffect="non-scaling-stroke"
                      />
                      
                      {/* Random Watermark Question Mark */}
                      {biomeId === 'random' && (
                        <text
                          x={p.x}
                          y={p.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={`${54 * zoneK}px`}
                          fontWeight="900"
                          fill="rgba(255, 255, 255, 0.08)"
                          pointerEvents="none"
                          fontFamily="'Outfit', sans-serif"
                        >
                          ?
                        </text>
                      )}
                      
                      {renderMainObjectBadges()}

                      <text
                        id={`zone-label-${zone.id}`}
                        className="zone-label"
                        x={p.x}
                        y={p.y}
                        fontSize={getFontSizeForLabel(labelStr) * zoneK}
                      >
                        {labelStr}
                      </text>

                      {/* Interactive hitbox rounded square */}
                      <rect
                        id={`zone-hit-${zone.id}`}
                        className="zone-hit"
                        x={p.x - 56 * zoneK}
                        y={p.y - 56 * zoneK}
                        width={112 * zoneK}
                        height={112 * zoneK}
                        rx={(hasCastles ? 14 : 56) * zoneK}
                        ry={(hasCastles ? 14 : 56) * zoneK}
                        onPointerDown={(e) => handleZonePointerDown(e, zone)}
                        onClick={(e) => handleZoneClick(e, zone)}
                      />
                    </g>
                  );
                })}
              </g>
            </g>
          </g>

          {/* Map Frame Border (Drawn on top of content to stay fixed and crisp) */}
          <rect x={xOffset} y={yOffset} width={w} height={h} rx="4" fill="none" stroke="var(--map-frame-stroke)" strokeWidth="1.5" pointerEvents="none" />

          {/* Rulers and Grid lines */}
          {/* X Axis Ruler */}
          <line x1={xOffset} y1={yOffset} x2={xOffset + w} y2={yOffset} className="ruler-line" vectorEffect="non-scaling-stroke" />
          <g clipPath="url(#xRulerClip)">
            {xTicks.map(val => {
              const tx = xOffset + (val / sizeX) * w * zoom + pan.x;
              return (
                <g key={`xtick-${val}`}>
                  <line x1={tx} y1={yOffset - 8} x2={tx} y2={yOffset} className="ruler-tick" vectorEffect="non-scaling-stroke" />
                  <text x={tx} y={yOffset - 16} className="ruler-label">{val}</text>
                </g>
              );
            })}
          </g>
          
          {/* Z Axis Ruler */}
          <line x1={xOffset} y1={yOffset} x2={xOffset} y2={yOffset + h} className="ruler-line" vectorEffect="non-scaling-stroke" />
          <g clipPath="url(#zRulerClip)">
            {zTicks.map(val => {
              const ty = yOffset + (val / sizeZ) * h * zoom + pan.y;
              return (
                <g key={`ztick-${val}`}>
                  <line x1={xOffset - 8} y1={ty} x2={xOffset} y2={ty} className="ruler-tick" vectorEffect="non-scaling-stroke" />
                  <text x={xOffset - 20} y={ty} className="ruler-label" textAnchor="end">{val}</text>
                </g>
              );
            })}
          </g>

          {/* Corner Axis Indicator */}
          <g className="ruler-corner-axis" aria-hidden="true">
            {/* Single '0' */}
            <text x={xOffset - 20} y={yOffset - 16} className="ruler-label" textAnchor="end">0</text>
            
            {/* Right Arrow (X-axis) - vertically shifted up to center with text, using integer coordinates to prevent subpixel blur */}
            <path 
              d={`M ${xOffset - 8} ${yOffset - 17.5} L ${xOffset + 8} ${yOffset - 17.5} M ${xOffset + 3} ${yOffset - 20} L ${xOffset + 7} ${yOffset - 17} L ${xOffset + 3} ${yOffset - 14}`}
              stroke="var(--ink)" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              fill="none" 
            />
            <text x={xOffset + 14} y={yOffset - 16} className="ruler-label" textAnchor="start">X</text>
            
            {/* Down Arrow (Z-axis) - shifted down to create visible gaps before and after */}
            <path 
              d={`M ${xOffset - 20} ${yOffset - 6} L ${xOffset - 20} ${yOffset + 10} M ${xOffset - 23} ${yOffset + 6} L ${xOffset - 20} ${yOffset + 10} L ${xOffset - 17} ${yOffset + 6}`}
              stroke="var(--ink)" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              fill="none" 
            />
            <text x={xOffset - 20} y={yOffset + 24} className="ruler-label" textAnchor="end">Z</text>
          </g>
          
        </svg>
      </div>
    </section>
  );
};
