import { InputReader } from './input';
import { PlayerIndex } from './types';

export interface TouchConfig {
  player?: PlayerIndex;
  size?: number;
  opacity?: number;
}

export class TouchControls {
  private container: HTMLDivElement | null = null;
  private player: PlayerIndex;

  constructor(private input: InputReader, private parentClass: HTMLElement, config: TouchConfig = {}) {
    this.player = config.player ?? 0;
    const size = config.size ?? 120;
    const opacity = config.opacity ?? 0.5;

    this.container = document.createElement('div');
    this.container.style.position = 'absolute';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '100';

    // D-Pad container
    const dpad = document.createElement('div');
    dpad.style.position = 'absolute';
    dpad.style.bottom = '20px';
    dpad.style.left = '20px';
    dpad.style.width = `${size}px`;
    dpad.style.height = `${size}px`;
    dpad.style.opacity = `${opacity}`;
    dpad.style.pointerEvents = 'auto';

    const btnStyle = `position: absolute; width: 33%; height: 33%; background: white; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 16px; user-select: none; font-weight: bold; color: black;`;

    this.makeBtn(dpad, 'up', '▲', `${btnStyle} top: 0; left: 33%;`);
    this.makeBtn(dpad, 'down', '▼', `${btnStyle} bottom: 0; left: 33%;`);
    this.makeBtn(dpad, 'left', '◀', `${btnStyle} top: 33%; left: 0;`);
    this.makeBtn(dpad, 'right', '▶', `${btnStyle} top: 33%; right: 0;`);

    // Buttons container
    const rightBtns = document.createElement('div');
    rightBtns.style.position = 'absolute';
    rightBtns.style.bottom = '20px';
    rightBtns.style.right = '20px';
    rightBtns.style.width = `${size * 1.5}px`;
    rightBtns.style.height = `${size}px`;
    rightBtns.style.opacity = `${opacity}`;
    rightBtns.style.pointerEvents = 'auto';

    const rBtnStyle = `position: absolute; width: ${size * 0.4}px; height: ${size * 0.4}px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 16px; user-select: none; font-weight: bold; color: black; box-shadow: 0 4px 6px rgba(0,0,0,0.3);`;

    this.makeBtn(rightBtns, 'b', 'B', `${rBtnStyle} bottom: 0; left: 0;`);
    this.makeBtn(rightBtns, 'a', 'A', `${rBtnStyle} bottom: ${size * 0.25}px; right: 0;`);
    
    // Start button (pill shape)
    this.makeBtn(rightBtns, 'start', 'START', `position: absolute; width: ${size * 0.6}px; height: ${size * 0.2}px; background: white; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-family: monospace; font-size: 10px; user-select: none; font-weight: bold; color: black; top: 0; left: 50%; transform: translateX(-50%);`);

    this.container.appendChild(dpad);
    this.container.appendChild(rightBtns);
    parentClass.appendChild(this.container);
  }

  private makeBtn(parent: HTMLElement, name: Parameters<InputReader['setState']>[1] extends Record<infer K, boolean> ? K : string, label: string, style: string) {
    const btn = document.createElement('div');
    btn.style.cssText = style;
    btn.innerText = label;

    const press = (e: Event) => {
      e.preventDefault();
      btn.style.transform = 'scale(0.9)';
      btn.style.background = '#ddd';
      this.input.setState(this.player, { [name]: true } as any);
    };

    const release = (e: Event) => {
      e.preventDefault();
      btn.style.transform = 'scale(1)';
      btn.style.background = 'white';
      this.input.setState(this.player, { [name]: false } as any);
    };

    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    
    // Fallback for mouse
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
    btn.addEventListener('mouseleave', release);

    parent.appendChild(btn);
  }

  destroy() {
    if (this.container && this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }
}
