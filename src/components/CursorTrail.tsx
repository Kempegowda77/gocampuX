import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
  decay: number;
}

const NEON_COLORS = [
  '#00F0FF', // gocompuX cyan
  '#FF5294', // Creative pink
  '#A05CFF', // Tech purple
  '#F59E0B', // Warning amber
];

export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, active: false });
  const ringRef = useRef({ x: 0, y: 0 }); // Lagging halo ring
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if device supports hover/fine pointer (e.g. has mouse)
    const mediaQuery = window.matchMedia('(pointer: fine)');
    if (!mediaQuery.matches) {
      canvas.style.display = 'none';
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Track mouse coordinates
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
      mouseRef.current.active = true;

      // Spawn trail particles
      if (Math.random() < 0.6) {
        const color = NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
        particlesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          alpha: 1,
          size: Math.random() * 4 + 2,
          color,
          decay: Math.random() * 0.03 + 0.02,
        });
      }
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    const handleMouseClick = (e: MouseEvent) => {
      // Spawn burst of particles on click
      const burstCount = 12;
      for (let i = 0; i < burstCount; i++) {
        const angle = (i / burstCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = Math.random() * 4 + 2;
        const color = NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
        particlesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          size: Math.random() * 5 + 3,
          color,
          decay: Math.random() * 0.02 + 0.015,
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('click', handleMouseClick);

    // Physics & Rendering Loop
    let animationId: number;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (mouseRef.current.active) {
        const targetX = mouseRef.current.x;
        const targetY = mouseRef.current.y;

        // Smooth Lerp for the outer ring (elastic lagging effect)
        ringRef.current.x += (targetX - ringRef.current.x) * 0.15;
        ringRef.current.y += (targetY - ringRef.current.y) * 0.15;

        // Draw glowing outer ring
        ctx.beginPath();
        ctx.arc(ringRef.current.x, ringRef.current.y, 16, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00F0FF';
        ctx.stroke();

        // Draw solid center dot
        ctx.beginPath();
        ctx.arc(targetX, targetY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#00F0FF';
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#00F0FF';
        ctx.fill();
      }

      // Update and draw trail particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      }

      ctx.globalAlpha = 1.0; // Reset global alpha
      ctx.shadowBlur = 0;    // Reset shadow

      animationId = requestAnimationFrame(render);
    };

    // Initialize position so it doesn't jump from (0,0)
    ringRef.current.x = window.innerWidth / 2;
    ringRef.current.y = window.innerHeight / 2;

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('click', handleMouseClick);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999] h-full w-full select-none"
    />
  );
}
