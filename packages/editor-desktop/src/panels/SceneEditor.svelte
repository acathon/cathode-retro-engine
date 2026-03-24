<script lang="ts">
  import { scene, entities, pushUndo } from '../store/scene';
  import { selectedIds, selectEntity, clearSelection } from '../store/selection';
  import { showColliders, showGrid } from '../store/editor';
  import type { EntityDef, SceneFile } from '../store/scene';
  import { onMount } from 'svelte';

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let panX = 0, panY = 0, zoom = 1;
  let isPanning = false;
  let isDragging = false;
  let dragOffsets: Map<string, { ox: number; oy: number }> = new Map();
  let lastMouse = { x: 0, y: 0 };
  $: currentScene = $scene;

  onMount(() => {
    ctx = canvas.getContext('2d')!;
    resizeCanvas();
    requestAnimationFrame(draw);
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  });

  function resizeCanvas() {
    const rect = canvas.parentElement!.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  function draw() {
    if (!ctx) { requestAnimationFrame(draw); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    const bg = currentScene?.bgColor ?? [0, 0, 0];
    ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Grid
    if ($showGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1 / zoom;
      const gridSize = 16;
      const startX = Math.floor(-panX / zoom / gridSize) * gridSize;
      const startY = Math.floor(-panY / zoom / gridSize) * gridSize;
      const endX = startX + canvas.width / zoom + gridSize;
      const endY = startY + canvas.height / zoom + gridSize;
      for (let x = startX; x < endX; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
      }
      for (let y = startY; y < endY; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
      }
    }

    // Entities
    if (currentScene) {
      const sorted = [...currentScene.entities].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0));
      for (const ent of sorted) {
        if (ent.visible === false) continue;
        const w = ent.collider?.w ?? 16;
        const h = ent.collider?.h ?? 16;

        // Entity rect
        ctx.fillStyle = $selectedIds.has(ent.id) ? '#7c3aff' : '#4488cc';
        ctx.fillRect(ent.x, ent.y, w, h);

        // Name label
        ctx.fillStyle = '#fff';
        ctx.font = `${10 / zoom}px sans-serif`;
        ctx.fillText(ent.name, ent.x, ent.y - 2 / zoom);

        // Selection border
        if ($selectedIds.has(ent.id)) {
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = 2 / zoom;
          ctx.strokeRect(ent.x - 1 / zoom, ent.y - 1 / zoom, w + 2 / zoom, h + 2 / zoom);
        }

        // Collider outline
        if ($showColliders && ent.collider) {
          ctx.strokeStyle = 'rgba(0,255,0,0.5)';
          ctx.lineWidth = 1 / zoom;
          ctx.strokeRect(
            ent.x + (ent.collider.offsetX ?? 0),
            ent.y + (ent.collider.offsetY ?? 0),
            ent.collider.w,
            ent.collider.h,
          );
        }
      }
    }

    ctx.restore();

    // Minimap
    drawMinimap();

    requestAnimationFrame(draw);
  }

  function drawMinimap() {
    if (!currentScene || currentScene.entities.length === 0) return;
    const mmW = 100, mmH = 80, mmX = canvas.width - mmW - 8, mmY = 8;

    // Compute bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of currentScene.entities) {
      minX = Math.min(minX, e.x);
      minY = Math.min(minY, e.y);
      maxX = Math.max(maxX, e.x + (e.collider?.w ?? 16));
      maxY = Math.max(maxY, e.y + (e.collider?.h ?? 16));
    }
    const rangeX = Math.max(maxX - minX, 1);
    const rangeY = Math.max(maxY - minY, 1);
    const scale = Math.min(mmW / rangeX, mmH / rangeY);

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    for (const e of currentScene.entities) {
      ctx.fillStyle = $selectedIds.has(e.id) ? '#7c3aff' : '#4488cc';
      ctx.fillRect(
        mmX + (e.x - minX) * scale,
        mmY + (e.y - minY) * scale,
        Math.max(2, (e.collider?.w ?? 16) * scale),
        Math.max(2, (e.collider?.h ?? 16) * scale),
      );
    }
  }

  function screenToWorld(sx: number, sy: number) {
    return { x: (sx - panX) / zoom, y: (sy - panY) / zoom };
  }

  function handleMouseDown(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (e.button === 1 || (e.button === 0 && e.getModifierState('Space'))) {
      isPanning = true;
      lastMouse = { x: mx, y: my };
      return;
    }

    if (e.button === 0 && currentScene) {
      const world = screenToWorld(mx, my);

      // Hit test (reverse order for top entities first)
      const ents = [...currentScene.entities].reverse();
      for (const ent of ents) {
        if (ent.visible === false) continue;
        const w = ent.collider?.w ?? 16;
        const h = ent.collider?.h ?? 16;
        if (world.x >= ent.x && world.x <= ent.x + w && world.y >= ent.y && world.y <= ent.y + h) {
          selectEntity(ent.id, e.shiftKey);
          isDragging = true;

          // Compute drag offsets for all selected
          dragOffsets.clear();
          for (const se of currentScene.entities) {
            if ($selectedIds.has(se.id)) {
              dragOffsets.set(se.id, { ox: world.x - se.x, oy: world.y - se.y });
            }
          }
          pushUndo(currentScene);
          lastMouse = { x: mx, y: my };
          return;
        }
      }
      clearSelection();
    }
  }

  function handleMouseMove(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isPanning) {
      panX += mx - lastMouse.x;
      panY += my - lastMouse.y;
      lastMouse = { x: mx, y: my };
      return;
    }

    if (isDragging && currentScene) {
      const world = screenToWorld(mx, my);
      scene.update((s) => {
        if (!s) return s;
        return {
          ...s,
          entities: s.entities.map((ent) => {
            const offset = dragOffsets.get(ent.id);
            if (!offset) return ent;
            return { ...ent, x: Math.round(world.x - offset.ox), y: Math.round(world.y - offset.oy) };
          }),
        };
      });
    }
  }

  function handleMouseUp() {
    isPanning = false;
    isDragging = false;
    dragOffsets.clear();
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    panX = mx - (mx - panX) * factor;
    panY = my - (my - panY) * factor;
    zoom *= factor;
    zoom = Math.max(0.1, Math.min(10, zoom));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Delete' && currentScene && $selectedIds.size > 0) {
      pushUndo(currentScene);
      scene.update((s) => {
        if (!s) return s;
        return { ...s, entities: s.entities.filter((ent) => !$selectedIds.has(ent.id)) };
      });
      clearSelection();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd' && currentScene && $selectedIds.size > 0) {
      e.preventDefault();
      pushUndo(currentScene);
      scene.update((s) => {
        if (!s) return s;
        const dupes = s.entities
          .filter((ent) => $selectedIds.has(ent.id))
          .map((ent) => ({ ...ent, id: crypto.randomUUID(), name: `${ent.name}_copy`, x: ent.x + 16, y: ent.y + 16 }));
        return { ...s, entities: [...s.entities, ...dupes] };
      });
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="scene-editor">
  <canvas
    bind:this={canvas}
    on:mousedown={handleMouseDown}
    on:mousemove={handleMouseMove}
    on:mouseup={handleMouseUp}
    on:mouseleave={handleMouseUp}
    on:wheel={handleWheel}
  />
</div>

<style>
  .scene-editor { flex: 1; position: relative; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
</style>
