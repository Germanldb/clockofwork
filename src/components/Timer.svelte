<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  // Configuración
  const DEFAULT_TIME = 25 * 60; // 25 minutos
  
  // Estado
  let timeRemaining = DEFAULT_TIME;
  let isRunning = false;
  let timerInterval: number | null = null;

  // Calculos
  $: minutes = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
  $: seconds = (timeRemaining % 60).toString().padStart(2, '0');
  $: progress = ((DEFAULT_TIME - timeRemaining) / DEFAULT_TIME) * 100;

  // Acciones
  function toggleTimer() {
    if (isRunning) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  function startTimer() {
    isRunning = true;
    timerInterval = setInterval(() => {
      if (timeRemaining > 0) {
        timeRemaining -= 1;
      } else {
        pauseTimer();
        // Aquí podríamos añadir un sonido o notificación cuando termine
      }
    }, 1000) as unknown as number;
  }

  function pauseTimer() {
    isRunning = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function resetTimer() {
    pauseTimer();
    timeRemaining = DEFAULT_TIME;
  }

  onDestroy(() => {
    if (timerInterval) clearInterval(timerInterval);
  });
</script>

<div class="timer-container">
  <div class="glass-panel">
    <h2 class="title">Modo Enfoque</h2>
    
    <div class="clock-display">
      <svg class="progress-ring" viewBox="0 0 200 200">
        <circle class="ring-bg" cx="100" cy="100" r="90" />
        <circle class="ring-progress" cx="100" cy="100" r="90" style="stroke-dashoffset: {565.48 - (565.48 * progress) / 100}" />
      </svg>
      <div class="time">{minutes}:{seconds}</div>
    </div>

    <div class="controls">
      <button class="btn btn-primary" on:click={toggleTimer} class:active={isRunning}>
        {isRunning ? 'Pausar' : 'Iniciar'}
      </button>
      <button class="btn btn-secondary" on:click={resetTimer}>
        Reiniciar
      </button>
    </div>
  </div>
</div>

<style>
  .timer-container {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    padding: 2rem;
  }

  .glass-panel {
    background: var(--glass-bg);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid var(--glass-border);
    border-radius: 2rem;
    padding: 3rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    max-width: 400px;
    width: 100%;
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .glass-panel:hover {
    transform: translateY(-5px);
    box-shadow: 0 30px 60px -12px var(--primary-glow);
  }

  .title {
    margin: 0 0 2rem 0;
    font-size: 1.5rem;
    font-weight: 400;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: #94a3b8;
  }

  .clock-display {
    position: relative;
    width: 250px;
    height: 250px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 3rem;
  }

  .time {
    font-size: 5rem;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    background: linear-gradient(to bottom right, #f8fafc, #cbd5e1);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    z-index: 2;
    text-shadow: 0 0 30px rgba(255, 255, 255, 0.1);
  }

  .progress-ring {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .progress-ring circle {
    fill: transparent;
    stroke-width: 8;
    stroke-dasharray: 565.48; /* 2 * pi * r (90) */
    transition: stroke-dashoffset 1s linear;
  }

  .ring-bg {
    stroke: var(--glass-border);
  }

  .ring-progress {
    stroke: var(--primary-color);
    stroke-linecap: round;
    filter: drop-shadow(0 0 8px var(--primary-glow));
  }

  .controls {
    display: flex;
    gap: 1rem;
    width: 100%;
  }

  .btn {
    flex: 1;
    padding: 1rem;
    border-radius: 1rem;
    border: none;
    font-family: inherit;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary {
    background: var(--primary-color);
    color: white;
    box-shadow: 0 0 20px var(--primary-glow);
  }

  .btn-primary:hover {
    background: #7c3aed;
    transform: scale(1.02);
  }

  .btn-primary.active {
    background: #ef4444;
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.4);
  }

  .btn-primary.active:hover {
    background: #dc2626;
  }

  .btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 1px solid var(--glass-border);
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.15);
    transform: scale(1.02);
  }
</style>
