<script lang="ts">
  import { onMount } from 'svelte';
  import { supabase } from '../lib/supabase';
  
  // Variables del Tracker Topbar
  let currentTask = '';
  let isTracking = false;
  let timeElapsed = 0; // en segundos
  let timerInterval: number | null = null;
  
  // Proyectos y Clientes
  let projects: { id: string, name: string, color: string, hourly_rate?: number }[] = [];
  let selectedProjectId = '';
  let currentView: 'timer' | 'projects' | 'reports' = 'timer';
  let newProjectName = '';
  let newProjectColor = '#8b5cf6';
  let newProjectRate = 0;
  
  // Para los efectos de hover en reportes
  let hoveredProjectId: string | null = null;
  
  let currentRate = 0;
  let initialized = false;

  function onProjectSelect() {
    const p = projects.find(x => x.id === selectedProjectId);
    if (p) {
      currentRate = p.hourly_rate || 0;
    }
  }
  
  // Lista de tareas registradas
  let tasks: any[] = [];
  let session: any = null;

  // Formateo del tiempo (HH:MM:SS)
  $: formattedTime = new Date(timeElapsed * 1000).toISOString().substr(11, 8);

  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    session = data.session;
    if (session) {
      await loadProjects();
      await loadTasks();
    }
    
    // Cargar tarifa por defecto
    const savedDefaultRate = localStorage.getItem('defaultHourlyRate');
    if (savedDefaultRate) currentRate = Number(savedDefaultRate);
    initialized = true;

    updateTimeLine();
    currentTimeInterval = setInterval(updateTimeLine, 60000) as unknown as number;
  });

  $: {
    if (initialized && !selectedProjectId && currentRate >= 0 && typeof window !== 'undefined') {
       localStorage.setItem('defaultHourlyRate', currentRate.toString());
    }
  }

  // Línea de Tiempo Actual
  let currentTimeLineTop = -1;
  let currentTimeInterval: number;

  function updateTimeLine() {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();
    
    currentTimeLineTop = (h * 60) + m;
  }

  async function loadProjects() {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (data) projects = data;
  }

  async function loadTasks() {
    const { data } = await supabase.from('time_entries').select('*, projects(name, color, hourly_rate)').order('date', { ascending: false });
    if (data) tasks = data;
  }
  
  function getTaskRate(t: any, fallbackRate: number) {
    return t.hourly_rate || (t.projects && t.projects.hourly_rate) || fallbackRate || 0;
  }

  async function toggleTimer() {
    if (isTracking) {
      // Detener
      clearInterval(timerInterval!);
      isTracking = false;
      
      // Guardar tarea en Supabase
      if (timeElapsed > 0 && session) {
        const entry = {
          user_id: session.user.id,
          project_id: selectedProjectId || null,
          task_name: currentTask || '',
          duration_seconds: timeElapsed,
          hourly_rate: currentRate
        };
        const { error } = await supabase.from('time_entries').insert([entry]);
        if (!error) await loadTasks();
      }
      
      // Reset
      timeElapsed = 0;
      currentTask = '';
    } else {
      // Iniciar
      isTracking = true;
      const startTime = Date.now() - (timeElapsed * 1000);
      timerInterval = setInterval(() => {
        timeElapsed = Math.floor((Date.now() - startTime) / 1000);
      }, 1000) as unknown as number;
    }
  }

  async function createProject() {
    if (!newProjectName.trim() || !session) return;
    const { error } = await supabase.from('projects').insert([{
      user_id: session.user.id,
      name: newProjectName,
      color: newProjectColor,
      hourly_rate: newProjectRate
    }]);
    if (!error) {
      newProjectName = '';
      newProjectRate = 0;
      await loadProjects();
    }
  }

  async function updateProject(project: any) {
    if (!project.name.trim()) return;
    await supabase.from('projects').update({ 
      name: project.name, 
      color: project.color,
      hourly_rate: project.hourly_rate 
    }).eq('id', project.id);
    await loadTasks();
  }

  async function deleteProject(id: string) {
    if (!confirm('¿Seguro que deseas eliminar este proyecto? Se perderán las tareas asociadas.')) return;
    await supabase.from('projects').delete().eq('id', id);
    await loadProjects();
    await loadTasks();
  }

  // Modal para registro manual
  let showManualModal = false;
  let editingTaskId: string | null = null;
  let manualTaskName = '';
  let manualProjectId = '';
  let manualStartTime = '08:00:00';
  let manualEndTime = '08:30:00';
  let manualDate: Date | null = null;
  let selectedDayLabel = '';
  let manualDurationText = '0:30:00';
  let manualRate = 0;

  function onManualProjectSelect() {
    const p = projects.find(x => x.id === manualProjectId);
    if (p) {
      manualRate = p.hourly_rate || 0;
    }
  }

  $: {
    if (manualStartTime && manualEndTime) {
      const [h1, m1, s1 = 0] = manualStartTime.split(':').map(Number);
      const [h2, m2, s2 = 0] = manualEndTime.split(':').map(Number);
      let diffSecs = (h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1);
      if (diffSecs < 0) diffSecs += 24 * 3600;
      
      const h = Math.floor(diffSecs / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;
      manualDurationText = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
  }

  $: durationSecondsParsed = (() => {
    if (!manualStartTime || !manualEndTime) return 0;
    const [h1, m1, s1 = 0] = manualStartTime.split(':').map(Number);
    const [h2, m2, s2 = 0] = manualEndTime.split(':').map(Number);
    let diffSecs = (h2 * 3600 + m2 * 60 + s2) - (h1 * 3600 + m1 * 60 + s1);
    if (diffSecs < 0) diffSecs += 24 * 3600;
    return diffSecs;
  })();

  function onDurationChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    const parts = val.split(':').map(Number);
    let totalSecs = 0;
    if (parts.length === 3) {
      totalSecs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    } else if (parts.length === 2) {
      totalSecs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60;
    } else if (parts.length === 1) {
      totalSecs = (parts[0] || 0) * 3600;
    }
    
    if (isNaN(totalSecs) || totalSecs < 0) totalSecs = 0;

    const [h1, m1, s1 = 0] = manualStartTime.split(':').map(Number);
    let startSecs = h1 * 3600 + m1 * 60 + s1;
    let endSecs = (startSecs + totalSecs) % (24 * 3600);
    
    let newH = Math.floor(endSecs / 3600);
    let newM = Math.floor((endSecs % 3600) / 60);
    let newS = endSecs % 60;
    
    manualEndTime = `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}:${newS.toString().padStart(2, '0')}`;
  }

  function formatDurationDisplay(diffSeconds: number) {
    const h = Math.floor(diffSeconds / 3600);
    const m = Math.floor((diffSeconds % 3600) / 60);
    return `${h}:${m.toString().padStart(2, '0')}:00`;
  }

  // Generación de semana real
  let currentDate = new Date();
  
  function getStartOfWeek(d: Date) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(date.setDate(diff));
    start.setHours(0,0,0,0);
    return start;
  }

  $: currentWeekStart = getStartOfWeek(currentDate);
  $: weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const daysNames = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  $: days = weekDays.map(d => `${daysNames[d.getDay()]} ${d.getDate()}`);

  function previousWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 7);
    currentDate = d;
  }
  
  function nextWeek() {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 7);
    currentDate = d;
  }
  
  $: weekInputValue = (() => {
    const target = new Date(currentWeekStart.valueOf());
    const dayNr = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
    return `${target.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  })();
  
  function onWeekChange(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    if (val) {
      const [year, week] = val.split('-W').map(Number);
      const simple = new Date(year, 0, 1 + (week - 1) * 7);
      currentDate = simple;
    }
  }

  function isSameDay(d1: Date, d2: Date) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  function isTaskInCurrentWeek(dateStr: string, wDays: Date[]) {
     const d = new Date(dateStr);
     d.setHours(0,0,0,0);
     return wDays.some(wd => wd.getTime() === d.getTime());
  }

  $: weekTotalSeconds = tasks.filter(t => isTaskInCurrentWeek(t.date, weekDays)).reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  $: weekTotalEarnings = tasks.filter(t => isTaskInCurrentWeek(t.date, weekDays)).reduce((acc, t) => acc + ((t.duration_seconds || 0) / 3600) * getTaskRate(t, currentRate), 0);

  let reportDate = new Date();
  function prevReportMonth() { reportDate = new Date(reportDate.getFullYear(), reportDate.getMonth() - 1, 1); }
  function nextReportMonth() { reportDate = new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 1); }
  $: reportMonthName = reportDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  $: reportTasks = tasks.filter(t => {
     const d = new Date(t.date);
     return d.getMonth() === reportDate.getMonth() && d.getFullYear() === reportDate.getFullYear();
  });
  $: reportTotalSeconds = reportTasks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
  $: reportTotalEarnings = reportTasks.reduce((acc, t) => acc + ((t.duration_seconds || 0) / 3600) * getTaskRate(t, currentRate), 0);

  $: reportDaysList = (() => {
     const numDays = new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 0).getDate();
     const arr = [];
     for(let i=1; i<=numDays; i++) {
        const d = new Date(reportDate.getFullYear(), reportDate.getMonth(), i);
        const dayTasks = reportTasks.filter(t => new Date(t.date).getDate() === i);
        const totalSecs = dayTasks.reduce((acc, t) => acc + (t.duration_seconds || 0), 0);
        arr.push({
           date: d,
           label: i.toString().padStart(2, '0'),
           totalSecs
        });
     }
     return arr;
  })();
  
  $: maxReportSecs = Math.max(...reportDaysList.map(d => d.totalSecs), 1);
  
  $: reportProjects = (() => {
    const projMap = new Map();
    reportTasks.forEach(t => {
      const pid = t.project_id || 'none';
      if (!projMap.has(pid)) {
         projMap.set(pid, {
           id: pid,
           name: t.projects?.name || '(Sin proyecto)',
           color: t.projects?.color || '#888',
           totalSecs: 0
         });
      }
      projMap.get(pid).totalSecs += (t.duration_seconds || 0);
    });

    let arr = Array.from(projMap.values()).filter(p => p.totalSecs > 0);
    arr.sort((a, b) => b.totalSecs - a.totalSecs);

    const total = arr.reduce((acc, p) => acc + p.totalSecs, 0);
    let currentOffset = 0;
    return arr.map(p => {
      const pct = total > 0 ? (p.totalSecs / total) : 0;
      const offset = currentOffset;
      currentOffset += pct * 100;
      return { ...p, pct, offset };
    });
  })();

  function getDayTasksWithLayout(allTasks: any[], dayObj: Date) {
    const dayTasks = allTasks.filter(t => isSameDay(new Date(t.date), dayObj));
    dayTasks.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 1. Calcular tiempos reales (sin mínimo visual para la lógica de solapamiento)
    const tasksWithTimes = dayTasks.map(task => {
      const start = new Date(task.date).getTime();
      // Usar duración real para que solo choquen si se solapan en tiempo real
      const durationMs = (task.duration_seconds || 0) * 1000;
      const end = start + durationMs;
      return { task, start, end, colIndex: 0 };
    });

    // 2. Agrupar en "clusters" de tareas que chocan
    const clusters: typeof tasksWithTimes[] = [];
    let currentCluster: typeof tasksWithTimes = [];
    let clusterEnd = 0;

    tasksWithTimes.forEach(t => {
      if (currentCluster.length === 0) {
        currentCluster.push(t);
        clusterEnd = t.end;
      } else {
        if (t.start < clusterEnd) {
          currentCluster.push(t);
          clusterEnd = Math.max(clusterEnd, t.end);
        } else {
          clusters.push(currentCluster);
          currentCluster = [t];
          clusterEnd = t.end;
        }
      }
    });
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // 3. Asignar columnas dentro de cada cluster
    const layoutResult: {task: any, style: string}[] = [];
    
    clusters.forEach(cluster => {
      const columns: any[][] = [];
      
      cluster.forEach(t => {
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          const lastTaskInCol = col[col.length - 1];
          if (t.start >= lastTaskInCol.end) {
            
            // Check for visual overlap (min 20 mins = 1200000 ms)
            const visualEnd = lastTaskInCol.start + Math.max(lastTaskInCol.task.duration_seconds || 0, 1200) * 1000;
            if (t.start < visualEnd) {
              t.visualCascade = (lastTaskInCol.visualCascade || 0) + 1;
            } else {
              t.visualCascade = 0;
            }

            col.push(t);
            t.colIndex = i;
            placed = true;
            break;
          }
        }
        if (!placed) {
          t.colIndex = columns.length;
          t.visualCascade = 0;
          columns.push([t]);
        }
      });

      const totalCols = columns.length || 1;

      cluster.forEach(t => {
        const d = new Date(t.task.date);
        const h = d.getHours();
        const m = d.getMinutes();
        
        let top = (h * 60) + m;
        let height = (t.task.duration_seconds / 60);
        if (height < 20) height = 20;

        const colorHex = t.task.projects?.color || '#8b5cf6';
        const borderColor = colorHex;
        // Fondo opaco combinando gris oscuro con 20% del color del proyecto
        const bgStyle = `background: linear-gradient(0deg, ${colorHex}33, ${colorHex}33), #1f1f1f;`;

        const cascadeOffset = (t.visualCascade || 0) * 8;
        const width = `calc(${100 / totalCols}% - 6px - ${cascadeOffset}px)`;
        const left = `calc(${(t.colIndex / totalCols) * 100}% + 4px + ${cascadeOffset}px)`;
        
        const style = `top: ${top}px; height: ${height}px; ${bgStyle} border-left-color: ${borderColor}; width: ${width}; left: ${left}; right: auto; z-index: ${t.colIndex + (t.visualCascade || 0) + 5};`;
        
        layoutResult.push({ task: t.task, style });
      });
    });

    return layoutResult;
  }

  function openManualModal(dayIndex: number | null, hour: number | null, task: any = null) {
    if (task) {
      editingTaskId = task.id;
      manualDate = new Date(task.date);
      manualTaskName = (task.task_name === '(Sin descripción)' || task.task_name === '(Sin título)') ? '' : task.task_name;
      manualProjectId = task.project_id || '';
      manualRate = task.hourly_rate || 0;
      
      const st = new Date(task.date);
      const et = new Date(st.getTime() + task.duration_seconds * 1000);
      
      manualStartTime = `${st.getHours().toString().padStart(2, '0')}:${st.getMinutes().toString().padStart(2, '0')}:${st.getSeconds().toString().padStart(2, '0')}`;
      manualEndTime = `${et.getHours().toString().padStart(2, '0')}:${et.getMinutes().toString().padStart(2, '0')}:${et.getSeconds().toString().padStart(2, '0')}`;
      
      selectedDayLabel = `${daysNames[manualDate.getDay()]} ${manualDate.getDate()}`;
      showManualModal = true;
      return;
    }

    editingTaskId = null;
    let d = new Date(weekDays[dayIndex!]);
    d.setHours(hour!, 0, 0, 0);
    manualDate = d;
    manualTaskName = '';
    manualProjectId = '';
    selectedDayLabel = days[dayIndex!];
    
    let maxEndMs = d.getTime();
    const cellEndMs = maxEndMs + 3600 * 1000;
    
    const dayTasks = tasks.filter(t => isSameDay(new Date(t.date), d));
    for (const t of dayTasks) {
      const tStart = new Date(t.date).getTime();
      const tEnd = tStart + (t.duration_seconds || 0) * 1000;
      if (tStart < cellEndMs && tEnd > d.getTime()) {
        if (tEnd > maxEndMs) {
          maxEndMs = tEnd;
        }
      }
    }
    
    const finalStart = new Date(maxEndMs);
    const finalEnd = new Date(maxEndMs + 30 * 60 * 1000); // +30 min por defecto
    
    manualStartTime = `${finalStart.getHours().toString().padStart(2, '0')}:${finalStart.getMinutes().toString().padStart(2, '0')}:${finalStart.getSeconds().toString().padStart(2, '0')}`;
    manualEndTime = `${finalEnd.getHours().toString().padStart(2, '0')}:${finalEnd.getMinutes().toString().padStart(2, '0')}:${finalEnd.getSeconds().toString().padStart(2, '0')}`;
    manualDurationText = '0:30:00';
    manualRate = 0;
    
    showManualModal = true;
  }

  async function deleteTask() {
    if (!editingTaskId) return;
    const { error } = await supabase.from('time_entries').delete().eq('id', editingTaskId);
    if (!error) {
      showManualModal = false;
      await loadTasks();
    }
  }

  async function saveManualEntry() {
    if (!session || !manualDate) return;
    
    const [h1, m1, s1 = 0] = manualStartTime.split(':').map(Number);
    manualDate.setHours(h1, m1, s1, 0);

    const entry = {
      user_id: session.user.id,
      project_id: manualProjectId || null,
      task_name: manualTaskName || '',
      duration_seconds: durationSecondsParsed,
      date: manualDate.toISOString(),
      hourly_rate: manualRate
    };
    
    let error;
    if (editingTaskId) {
      const res = await supabase.from('time_entries').update(entry).eq('id', editingTaskId);
      error = res.error;
    } else {
      const res = await supabase.from('time_entries').insert([entry]);
      error = res.error;
    }
    
    if (!error) {
      showManualModal = false;
      await loadTasks();
    }
  }

  // Generamos horas del 00:00 al 23:00 para la cuadrícula del calendario
  const hours = Array.from({ length: 24 }, (_, i) => i);
</script>

<div class="dashboard-wrapper">
  <!-- Barra Lateral (Sidebar) -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="workspace">ClockOfWork</div>
    </div>
    
    <nav class="nav-menu">
      <div class="nav-section">
        <span class="section-title">SEGUIMIENTO</span>
        <button class="nav-item" class:active={currentView === 'timer'} on:click={() => currentView = 'timer'}>
          <span class="icon">⏱</span> Cronómetro
        </button>
      </div>
      
      <div class="nav-section">
        <span class="section-title">ANÁLISIS</span>
        <button class="nav-item" class:active={currentView === 'reports'} on:click={() => currentView = 'reports'}>
          <span class="icon">📊</span> Reportes
        </button>
      </div>
      
      <div class="nav-section">
        <span class="section-title">ADMINISTRAR</span>
        <button class="nav-item" class:active={currentView === 'projects'} on:click={() => currentView = 'projects'}>
          <span class="icon">📁</span> Proyectos
        </button>
        <button class="nav-item">
          <span class="icon">🏷️</span> Etiquetas
        </button>
      </div>
    </nav>
  </aside>

  <!-- Contenido Principal -->
  <main class="main-content">
    
    <!-- Topbar: Tracker (El Timer rápido) -->
    <header class="topbar">
      <div class="tracker-input-group">
        <input 
          type="text" 
          bind:value={currentTask} 
          placeholder="¿En qué estás trabajando?" 
          class="task-input"
        />
        <div class="project-selector">
          <span class="icon">📁</span>
          <select bind:value={selectedProjectId} class="project-input" on:change={onProjectSelect}>
            <option value="">(Sin proyecto)</option>
            {#each projects as p}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </div>
        
        <div class="rate-selector">
          <span class="currency">$</span>
          <input type="number" bind:value={currentRate} class="rate-input" title="Tarifa por hora" placeholder="0.00" />
          <span class="per-hour">/h</span>
          
          {#if currentRate > 0 || weekTotalEarnings > 0}
            <div class="accumulated-badge" title="Acumulado de la semana">
              <span class="acc-icon">📈</span>
              <span class="acc-val">${(weekTotalEarnings + (isTracking ? (timeElapsed / 3600) * currentRate : 0)).toFixed(2)}</span>
            </div>
          {/if}
        </div>
      </div>
      
      <div class="tracker-controls">
        <span class="time-display">{formattedTime}</span>
        <button 
          class="play-button" 
          class:is-tracking={isTracking} 
          on:click={toggleTimer}
        >
          {isTracking ? '⏹' : '▶'}
        </button>
      </div>
    </header>

    <!-- Contenido Condicional -->
    {#if currentView === 'timer'}
      <!-- Vista de Calendario -->
      <div class="calendar-view">
        
        <!-- Toolbar del calendario -->
        <div class="calendar-toolbar">
          <div class="toolbar-left">
            <button class="btn-icon" on:click={previousWeek}>{"<"}</button>
            <input type="week" class="week-picker" value={weekInputValue} on:change={onWeekChange} />
            <button class="btn-icon" on:click={nextWeek}>{">"}</button>
            <span class="week-total">
              TOTAL SEMANA: {formatDurationDisplay(weekTotalSeconds)}
              {#if weekTotalEarnings > 0}
                <span style="color: var(--t-success, #10b981); margin-left: 8px; font-weight: 600;">(${weekTotalEarnings.toFixed(2)})</span>
              {/if}
            </span>
          </div>
          <div class="toolbar-right">
            <button class="btn-view active">Calendario</button>
            <button class="btn-view">Vista de lista</button>
          </div>
        </div>

        <!-- Cuadrícula del Calendario -->
        <div class="calendar-grid-container">
          
          <!-- Cabecera de días -->
          <div class="calendar-header">
            <div class="time-col-header"></div>
            {#each days as day}
              <div class="day-col-header">
                <span class="day-name">{day.split(' ')[0]}</span>
                <span class="day-number">{day.split(' ')[1]}</span>
              </div>
            {/each}
          </div>

          <!-- Cuerpo del calendario (Horas y columnas) -->
          <div class="calendar-body">
            <div class="time-col">
              {#each hours as hour}
                <div class="time-slot">{hour === 0 ? 12 : (hour <= 12 ? hour : hour - 12)}:00 {hour < 12 ? 'AM' : 'PM'}</div>
              {/each}
            </div>
            
            <div class="days-container" style="position: relative;">
              {#if currentTimeLineTop >= 0}
                <div class="current-time-line" style="top: {currentTimeLineTop}px;"></div>
              {/if}
              
              {#each weekDays as dayObj, dayIndex}
                <div class="day-col">
                  {#each hours as hour}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="grid-cell" on:click={() => openManualModal(dayIndex, hour)}></div>
                  {/each}
                  
                  <!-- Tareas del día -->
                  {#each getDayTasksWithLayout(tasks, dayObj) as layoutData}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div class="task-block task-block-clickable" style={layoutData.style} on:click|stopPropagation={() => openManualModal(null, null, layoutData.task)}>
                      <div class="task-block-title">
                        {#if layoutData.task.projects}
                          <span class="project-label" style="color: {layoutData.task.projects.color || 'var(--t-accent)'}">{layoutData.task.projects.name}</span>
                        {/if}
                        {#if layoutData.task.task_name && layoutData.task.task_name !== '(Sin descripción)' && layoutData.task.task_name !== '(Sin título)'}
                          <span class="desc-label">{layoutData.task.projects ? '·' : ''} {layoutData.task.task_name}</span>
                        {:else}
                          <span class="desc-label" style="opacity: 0.6; font-style: italic;">{layoutData.task.projects ? '·' : ''} (Sin título)</span>
                        {/if}
                      </div>
                      <div class="task-block-time" style="font-size: 0.7rem; opacity: 0.8; margin-top: 2px;">
                        {new Date(layoutData.task.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})} - 
                        {new Date(new Date(layoutData.task.date).getTime() + (layoutData.task.duration_seconds || 0) * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: true})}
                      </div>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        </div>
        
      </div>
    {:else if currentView === 'projects'}
      <!-- Vista de Gestión de Proyectos -->
      <div class="projects-view">
        <div class="projects-header">
          <h2>Proyectos y Clientes</h2>
          <form class="add-project-form" on:submit|preventDefault={createProject}>
            <input type="text" bind:value={newProjectName} placeholder="Nuevo proyecto o cliente..." required class="new-project-input" />
            <input type="color" bind:value={newProjectColor} class="color-picker" />
            <button type="submit" class="btn-create">Crear</button>
          </form>
        </div>
        
        <div class="projects-list">
          {#each projects as project}
            <div class="project-card" style="border-left: 4px solid {project.color};">
              <div class="project-info">
                <span class="project-icon" style="color: {project.color};">●</span>
                <span class="project-name">{project.name}</span>
              </div>
              <button class="btn-delete" on:click={() => deleteProject(project.id)}>Eliminar</button>
            </div>
          {/each}
          {#if projects.length === 0}
            <div class="empty-state">No tienes proyectos registrados.</div>
          {/if}
        </div>
      </div>
    {:else if currentView === 'reports'}
      <!-- Vista de Reportes -->
      <div class="reports-view">
        
        <div class="reports-header" style="display: flex; gap: 0.5rem; align-items: center;">
          <button class="btn-icon" on:click={prevReportMonth}>{"<"}</button>
          <div class="date-range-badge">
            <span class="icon">📅</span>
            {reportMonthName.toUpperCase()}
          </div>
          <button class="btn-icon" on:click={nextReportMonth}>{">"}</button>
        </div>

        <div class="kpi-cards">
          <div class="kpi-card">
            <span class="kpi-title">Total Hours</span>
            <span class="kpi-value">{formatDurationDisplay(reportTotalSeconds)}</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">Billable Hours</span>
            <span class="kpi-value">{formatDurationDisplay(reportTotalSeconds)}</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-title">Amount</span>
            <span class="kpi-value">${reportTotalEarnings.toFixed(2)}</span>
          </div>
          <div class="kpi-card" style="border-right: none;">
            <span class="kpi-title">Average Daily Hours</span>
            <span class="kpi-value">{formatDurationDisplay(Math.floor(reportTotalSeconds / new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 0).getDate()))}</span>
          </div>
        </div>

        <div class="charts-row">
          <div class="bar-chart-container">
            <div class="chart-title">Duration by day</div>
            <div class="bar-chart">
              {#each reportDaysList as rDay}
                <div class="bar-col">
                  <div class="bar-value" style="opacity: {rDay.totalSecs > 0 ? 1 : 0}; font-size: 0.55rem;">{formatDurationDisplay(rDay.totalSecs)}</div>
                  <div class="bar-track">
                    <div class="bar-fill" style="height: {(rDay.totalSecs / maxReportSecs) * 100}%;"></div>
                  </div>
                  <div class="bar-label" style="font-size: 0.6rem;">{rDay.label}</div>
                </div>
              {/each}
            </div>
          </div>

          <div class="donut-chart-container">
            <div class="chart-title" style="display: flex; justify-content: space-between;">
              Project distribution
            </div>
            <div class="donut-content">
              <div class="donut-svg-wrapper">
                <svg viewBox="0 0 40 40" class="donut-svg">
                  <!-- Segments -->
                  {#each reportProjects as rp}
                    <circle 
                      cx="20" cy="20" r="15.91549430918954" 
                      fill="transparent" 
                      stroke={rp.color} 
                      stroke-width="5"
                      pathLength="100"
                      stroke-dasharray="{rp.pct * 100} {100 - rp.pct * 100}"
                      stroke-dashoffset={-rp.offset} 
                      class="donut-segment"
                      on:mouseenter={() => hoveredProjectId = rp.id}
                      on:mouseleave={() => hoveredProjectId = null}
                      style="filter: {hoveredProjectId === rp.id ? `drop-shadow(0 0 6px ${rp.color})` : 'none'}; opacity: {hoveredProjectId && hoveredProjectId !== rp.id ? 0.3 : 1}; cursor: pointer;"
                    />
                  {/each}
                </svg>
                <div class="donut-center-text">
                  <div style="font-weight: 600; font-size: 1.1rem; color: white;">{formatDurationDisplay(reportTotalSeconds)}</div>
                  <div style="font-size: 0.6rem; color: #888; margin-top: 2px;">PROJECT</div>
                </div>
              </div>
              <div class="donut-legend">
                {#each reportProjects as rp}
                  <!-- svelte-ignore a11y-no-static-element-interactions -->
                  <div class="legend-item"
                       on:mouseenter={() => hoveredProjectId = rp.id}
                       on:mouseleave={() => hoveredProjectId = null}
                       style="transition: all 0.2s; {hoveredProjectId === rp.id ? `color: white; text-shadow: 0 0 8px ${rp.color};` : ''} opacity: {hoveredProjectId && hoveredProjectId !== rp.id ? 0.4 : 1}; cursor: pointer;">
                    <div style="display: flex; align-items: center; gap: 0.4rem;">
                      <span class="legend-color" style="background: {rp.color}; {hoveredProjectId === rp.id ? `box-shadow: 0 0 8px ${rp.color};` : ''}"></span>
                      <span class="legend-name">{rp.name}</span>
                    </div>
                    <span class="legend-pct">{(rp.pct * 100).toFixed(2)}%</span>
                  </div>
                {/each}
                {#if reportProjects.length === 0}
                  <div class="empty-state" style="padding: 1rem; border: none;">No data</div>
                {/if}
              </div>
            </div>
          </div>
        </div>

        <div class="table-container">
          <div class="table-header">
            <div>PROJECT | MEMBER</div>
            <div style="text-align: right;">DURATION</div>
            <div style="text-align: right;">DURATION %</div>
          </div>
          {#each reportProjects as rp}
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div class="table-row"
                 on:mouseenter={() => hoveredProjectId = rp.id}
                 on:mouseleave={() => hoveredProjectId = null}
                 style="transition: all 0.2s; {hoveredProjectId === rp.id ? `background: rgba(255,255,255,0.03); box-shadow: inset 2px 0 0 ${rp.color};` : ''} opacity: {hoveredProjectId && hoveredProjectId !== rp.id ? 0.4 : 1}; cursor: pointer; padding-left: 0.5rem; border-radius: 4px;">
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="legend-color" style="background: {rp.color}; {hoveredProjectId === rp.id ? `box-shadow: 0 0 8px ${rp.color};` : ''}"></span>
                <span style="font-weight: 500; {hoveredProjectId === rp.id ? 'color: white;' : ''}">{rp.name}</span>
              </div>
              <div style="text-align: right; font-family: monospace;">{formatDurationDisplay(rp.totalSecs)}</div>
              <div style="text-align: right; font-family: monospace; font-weight: 600;">{(rp.pct * 100).toFixed(2)}%</div>
            </div>
          {/each}
          {#if reportProjects.length === 0}
            <div class="empty-state">No data available for this week</div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Modal Entrada Manual (Estilo Toggl) -->
    {#if showManualModal}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div class="modal-overlay" on:click={() => showManualModal = false}>
        <div class="modal-content toggl-modal" on:click|stopPropagation>
          <div class="toggl-modal-header">
            <button class="close-btn" on:click={() => showManualModal = false}>✕</button>
          </div>
          
          <input type="text" bind:value={manualTaskName} placeholder="Añade una descripción" class="toggl-modal-title" />
          
          <div class="toggl-modal-icons">
            <div class="icon-group">
              <span class="icon" style="color: {projects.find(p => p.id === manualProjectId)?.color || '#888'};">📁</span>
              <select bind:value={manualProjectId} on:change={onManualProjectSelect} class="invisible-select">
                <option value="">(Sin proyecto)</option>
                {#each projects as p}
                  <option value={p.id}>{p.name}</option>
                {/each}
              </select>
            </div>
            <div class="icon-group">
              <span class="icon" style="color: #4ade80;">💲</span>
              <input type="number" step="0.01" bind:value={manualRate} class="invisible-input rate-small" title="Tarifa por hora" />
              <span style="color: #888; font-size: 0.8rem;">/h</span>
            </div>
            {#if manualRate > 0}
              <div class="icon-group" style="background: rgba(16, 185, 129, 0.1); padding: 2px 8px; border-radius: 4px; margin-left: 8px;">
                <span class="icon" style="color: #10b981;">📈</span>
                <span style="color: #10b981; font-weight: 600;">${((durationSecondsParsed / 3600) * manualRate).toFixed(2)}</span>
              </div>
            {/if}
          </div>
          
          <div class="toggl-modal-footer">
            <div class="time-range-group">
              <div class="toggl-time-box">
                <input type="time" step="1" bind:value={manualStartTime} class="clean-time-input" />
                <span class="icon date-icon" title={selectedDayLabel}>📅</span>
              </div>
              <span class="time-separator">→</span>
              <div class="toggl-time-box">
                <input type="time" step="1" bind:value={manualEndTime} class="clean-time-input" />
              </div>
            </div>
            
            <div class="footer-right">
              {#if editingTaskId}
                <button 
                  class="icon" 
                  on:click={deleteTask} 
                  style="color: #ff4444; border: none; background: transparent; cursor: pointer; font-size: 1.2rem; margin-right: 0.5rem;" 
                  title="Eliminar tarea">
                  🗑️
                </button>
              {/if}
              <input 
                type="text" 
                class="duration-input" 
                value={manualDurationText} 
                on:change={onDurationChange} 
                title="Editar duración" 
              />
              <button class="btn-create" on:click={saveManualEntry}>{editingTaskId ? 'Guardar' : 'Añadir'}</button>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </main>
</div>

<style>
  /* Estilos inspirados en Toggl Track (Dark Theme) */
  :root {
    --t-bg-dark: #1A1A1A;
    --t-bg-darker: #141414;
    --t-bg-panel: #242424;
    --t-border: #333333;
    --t-text-main: #E5E5E5;
    --t-text-muted: #999999;
    --t-accent: #8b5cf6; /* Cambiado a morado */
    --t-accent-hover: #7c3aed;
  }

  .dashboard-wrapper {
    display: flex;
    height: 100vh;
    width: 100vw;
    background-color: var(--t-bg-dark);
    color: var(--t-text-main);
    font-family: 'Outfit', sans-serif;
  }

  /* Sidebar */
  .sidebar {
    width: 240px;
    background-color: var(--t-bg-darker);
    border-right: 1px solid var(--t-border);
    display: flex;
    flex-direction: column;
  }

  .sidebar-header {
    padding: 1.5rem 1rem;
    border-bottom: 1px solid var(--t-border);
  }

  .workspace {
    font-weight: 600;
    font-size: 1.1rem;
  }

  .nav-menu {
    padding: 1rem 0;
    flex: 1;
    overflow-y: auto;
  }

  .nav-section {
    margin-bottom: 1.5rem;
  }

  .section-title {
    font-size: 0.75rem;
    color: var(--t-text-muted);
    padding: 0 1.5rem;
    margin-bottom: 0.5rem;
    display: block;
    font-weight: 600;
    letter-spacing: 1px;
  }

  .nav-item {
    width: 100%;
    text-align: left;
    padding: 0.5rem 1.5rem;
    background: transparent;
    border: none;
    color: var(--t-text-main);
    font-family: inherit;
    font-size: 0.95rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    transition: background 0.2s;
  }

  .nav-item:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }

  .nav-item.active {
    background-color: rgba(139, 92, 246, 0.1);
    color: var(--t-accent);
    border-left: 3px solid var(--t-accent);
  }

  /* Main Content */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Topbar / Tracker */
  .topbar {
    height: 70px;
    background-color: var(--t-bg-panel);
    border-bottom: 1px solid var(--t-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 2rem;
  }

  .tracker-input-group {
    display: flex;
    align-items: center;
    flex: 1;
    gap: 1rem;
  }

  .task-input {
    background: transparent;
    border: none;
    color: white;
    font-size: 1.1rem;
    width: 50%;
    outline: none;
    font-family: inherit;
  }

  .task-input::placeholder {
    color: var(--t-text-muted);
  }

  .project-selector {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--t-accent);
  }

  .project-input {
    background: transparent;
    border: none;
    color: var(--t-accent);
    font-size: 0.9rem;
    outline: none;
    width: 130px;
    font-family: inherit;
    cursor: text;
  }
  
  .project-input::placeholder {
    color: rgba(139, 92, 246, 0.5);
  }

  .rate-selector {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: var(--t-success, #10b981);
    font-size: 0.9rem;
    margin-left: 1rem;
    background: rgba(16, 185, 129, 0.05);
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    border: 1px solid rgba(16, 185, 129, 0.2);
  }

  .rate-input {
    background: transparent;
    border: none;
    color: var(--t-success, #10b981);
    font-size: 0.9rem;
    outline: none;
    width: 50px;
    font-family: inherit;
    text-align: right;
  }
  
  .rate-input::-webkit-outer-spin-button,
  .rate-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .per-hour {
    color: rgba(16, 185, 129, 0.7);
    font-size: 0.8rem;
  }

  .accumulated-badge {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-left: 0.5rem;
    padding-left: 0.5rem;
    border-left: 1px solid rgba(16, 185, 129, 0.3);
    font-weight: 600;
  }

  .week-picker {
    background: var(--t-bg-panel);
    border: 1px solid var(--t-border);
    color: var(--t-text-main);
    padding: 0.3rem 0.5rem;
    border-radius: 4px;
    font-family: inherit;
    color-scheme: dark;
  }

  .tracker-controls {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .time-display {
    font-size: 1.5rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .play-button {
    width: 45px;
    height: 45px;
    border-radius: 50%;
    background-color: var(--t-accent);
    color: white;
    border: none;
    font-size: 1.2rem;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    transition: transform 0.2s, background 0.2s;
  }

  .play-button:hover {
    transform: scale(1.05);
    background-color: var(--t-accent-hover);
  }

  .play-button.is-tracking {
    background-color: #EF4444; /* Rojo para detener */
  }

  /* Calendar View */
  .calendar-view {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: var(--t-bg-dark);
    overflow: hidden;
  }

  .calendar-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid var(--t-border);
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    font-size: 0.9rem;
  }

  .current-week {
    font-weight: 600;
  }

  .week-total {
    color: var(--t-text-muted);
    font-weight: 600;
    margin-left: 1rem;
  }

  .btn-icon {
    background: transparent;
    border: 1px solid var(--t-border);
    color: white;
    width: 30px;
    height: 30px;
    border-radius: 4px;
    cursor: pointer;
  }

  .toolbar-right {
    display: flex;
    background: var(--t-bg-darker);
    border-radius: 6px;
    padding: 2px;
  }

  .btn-view {
    background: transparent;
    border: none;
    color: var(--t-text-muted);
    padding: 0.4rem 1rem;
    font-size: 0.85rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-view.active {
    background: var(--t-bg-panel);
    color: white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  }

  /* Calendar Grid */
  .calendar-grid-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .calendar-header {
    display: flex;
    border-bottom: 1px solid var(--t-border);
    padding: 0.5rem 0;
  }

  .time-col-header {
    width: 60px;
    flex-shrink: 0;
  }

  .day-col-header {
    flex: 1;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .day-name {
    font-size: 0.75rem;
    color: var(--t-text-muted);
    font-weight: 600;
  }

  .day-number {
    font-size: 1.5rem;
    font-weight: 300;
  }

  .calendar-body {
    display: flex;
    flex: 1;
  }

  .time-col {
    width: 60px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }

  .time-slot {
    height: 60px;
    font-size: 0.7rem;
    color: var(--t-text-muted);
    text-align: right;
    padding-right: 0.5rem;
    transform: translateY(-8px);
  }

  .days-container {
    display: flex;
    flex: 1;
  }

  .day-col {
    flex: 1;
    border-left: 1px solid var(--t-border);
    position: relative;
  }

  .grid-cell {
    height: 60px;
    border-bottom: 1px solid var(--t-border);
    cursor: pointer;
    transition: background 0.2s;
  }

  .grid-cell:hover {
    background: rgba(139, 92, 246, 0.05);
  }

  .current-time-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background-color: var(--t-accent);
    z-index: 10;
    pointer-events: none;
  }
  .current-time-line::before {
    content: '▶';
    position: absolute;
    left: -8px;
    top: -6px;
    color: var(--t-accent);
    font-size: 12px;
  }

  /* Task Block Mockup */
  .task-block {
    position: absolute;
    left: 4px;
    right: 4px;
    border-left: 3px solid var(--t-accent);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    font-size: 0.8rem;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    overflow: hidden;
    box-shadow: 0 2px 5px rgba(0,0,0,0.5);
    border-top: 1px solid rgba(255,255,255,0.05);
    border-right: 1px solid rgba(255,255,255,0.05);
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
  
  .task-block-clickable {
    cursor: pointer;
    transition: filter 0.2s;
  }
  .task-block-clickable:hover {
    filter: brightness(1.2);
    z-index: 5;
  }

  .task-block-title {
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }
  .project-label {
    font-weight: 700;
    margin-right: 4px;
    filter: brightness(1.2); /* Make it pop a bit more on dark bg */
  }
  .desc-label {
    font-weight: 400;
    color: #ccc;
    font-size: 0.9em;
  }

  .task-block-time {
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.7);
  }

  /* Projects View */
  .projects-view {
    padding: 3rem 4rem;
    flex: 1;
    overflow-y: auto;
    background-color: var(--t-bg-dark);
  }

  .projects-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3rem;
  }

  .projects-header h2 {
    font-size: 2rem;
    font-weight: 600;
    margin: 0;
  }

  .add-project-form {
    display: flex;
    gap: 1rem;
  }

  .new-project-input {
    background: var(--t-bg-panel);
    border: 1px solid var(--t-border);
    color: white;
    padding: 0.8rem 1.2rem;
    border-radius: 6px;
    font-size: 1rem;
    width: 300px;
    outline: none;
    transition: border-color 0.2s;
  }

  .new-project-input:focus {
    border-color: var(--t-accent);
  }

  .color-picker {
    background: transparent;
    border: none;
    height: 45px;
    width: 45px;
    cursor: pointer;
    border-radius: 6px;
    padding: 0;
  }

  .btn-create {
    background-color: var(--t-accent);
    color: white;
    border: none;
    padding: 0 1.5rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-create:hover {
    background-color: var(--t-accent-hover);
  }

  .projects-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 800px;
  }

  .project-card {
    background-color: var(--t-bg-panel);
    border: 1px solid var(--t-border);
    padding: 1.5rem;
    border-radius: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: border-color 0.2s;
  }

  .project-card:hover {
    border-color: rgba(139, 92, 246, 0.4);
  }

  .project-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .project-icon {
    font-size: 1.5rem;
  }

  .project-name {
    font-size: 1.2rem;
    font-weight: 500;
  }

  .btn-delete {
    background: transparent;
    color: #EF4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-delete:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: #EF4444;
  }

  .empty-state {
    color: var(--t-text-muted);
    text-align: center;
    padding: 3rem;
    border: 1px dashed var(--t-border);
    border-radius: 8px;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }
  /* Toggl Modal Redesign */
  .toggl-modal {
    background: #2C2C2C;
    border: none;
    border-radius: 8px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    padding: 1.5rem 2rem;
    color: #E5E5E5;
    width: fit-content;
    min-width: 520px;
    max-width: 90vw;
  }
  .toggl-modal-header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.5rem;
  }
  .close-btn {
    background: transparent;
    border: none;
    color: #888;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
  }
  .close-btn:hover { color: white; }
  
  .toggl-modal-title {
    background: transparent;
    border: none;
    color: white;
    font-size: 1.15rem;
    width: 100%;
    outline: none;
    margin-bottom: 1.5rem;
    font-weight: 500;
  }
  .toggl-modal-title::placeholder {
    color: #888;
  }
  
  .toggl-modal-icons {
    display: flex;
    gap: 1.2rem;
    margin-bottom: 1rem;
    align-items: center;
  }
  .toggl-modal-icons .icon {
    font-size: 1.1rem;
    color: #888;
    cursor: pointer;
    transition: color 0.2s;
  }
  .toggl-modal-icons .icon:hover {
    color: #ccc;
  }
  .icon-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .invisible-select {
    background: transparent;
    border: none;
    color: #ccc;
    outline: none;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .invisible-input {
    background: transparent;
    border: none;
    color: white;
    outline: none;
    font-size: 0.95rem;
  }
  .invisible-input::-webkit-outer-spin-button,
  .invisible-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .rate-small {
    width: 40px;
    text-align: right;
  }
  
  .toggl-modal-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1.5rem;
    border-top: 1px solid #444;
    padding-top: 1.2rem;
  }
  .time-range-group {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }
  .toggl-time-box {
    display: flex;
    align-items: center;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 0.4rem 0.6rem;
    background: transparent;
    transition: border-color 0.2s;
  }
  .toggl-time-box:hover, .toggl-time-box:focus-within {
    border-color: var(--t-accent);
  }
  .clean-time-input {
    background: transparent;
    border: none;
    color: white;
    font-family: inherit;
    font-size: 0.95rem;
    outline: none;
    color-scheme: dark;
    padding: 0;
    margin: 0;
    cursor: text;
  }
  .clean-time-input::-webkit-calendar-picker-indicator {
    display: none;
    -webkit-appearance: none;
  }
  .date-icon {
    font-size: 0.9rem;
    color: #888;
    margin-left: 0.5rem;
    cursor: pointer;
  }
  .time-separator {
    color: #888;
    font-weight: bold;
  }
  
  .footer-right {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  .duration-input {
    background: transparent;
    border: none;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 1rem;
    color: #888;
    width: 65px;
    outline: none;
    text-align: center;
    cursor: text;
    transition: color 0.2s;
  }
  .duration-input:hover, .duration-input:focus {
    color: white;
    border-bottom: 1px solid #666;
  }
  .toggl-modal .btn-create {
    padding: 0.5rem 1.2rem;
    border-radius: 6px;
  }

  /* Reports View */
  .reports-view {
    padding: 1.5rem 2rem;
    flex: 1;
    overflow-y: auto;
    background-color: var(--t-bg-dark);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .date-range-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--t-bg-panel);
    border: 1px solid var(--t-border);
    padding: 0.4rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    color: white;
  }
  .kpi-cards {
    display: flex;
    background: var(--t-bg-panel);
    border: 1px solid var(--t-border);
    border-radius: 8px;
    padding: 1rem 0;
  }
  .kpi-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0 1.5rem;
    border-right: 1px solid var(--t-border);
  }
  .kpi-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--t-text-main);
  }
  .kpi-value {
    font-size: 1.2rem;
    font-weight: 600;
    color: white;
  }
  .charts-row {
    display: flex;
    gap: 1.5rem;
    height: 350px;
  }
  .bar-chart-container, .donut-chart-container, .table-container {
    background: var(--t-bg-panel);
    border: 1px solid var(--t-border);
    border-radius: 8px;
    padding: 1.2rem;
    display: flex;
    flex-direction: column;
  }
  .bar-chart-container {
    flex: 2;
  }
  .donut-chart-container {
    flex: 1;
    min-width: 300px;
  }
  .chart-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: white;
    margin-bottom: 1rem;
  }
  .bar-chart {
    flex: 1;
    display: flex;
    justify-content: space-around;
    align-items: flex-end;
    border-bottom: 1px solid var(--t-border);
    padding-bottom: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .bar-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    justify-content: flex-end;
    gap: 0.3rem;
  }
  .bar-value {
    font-size: 0.65rem;
    color: #888;
  }
  .bar-track {
    width: 100%;
    max-width: 20px;
    flex: 1;
    display: flex;
    align-items: flex-end;
    background: transparent;
  }
  .bar-fill {
    width: 100%;
    background: #d946ef; /* Magenta color from mockup */
    border-radius: 3px 3px 0 0;
    transition: height 0.5s ease-out;
  }
  .bar-label {
    font-size: 0.7rem;
    color: #888;
    text-align: center;
    font-weight: 600;
  }
  .donut-content {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex: 1;
  }
  .donut-svg-wrapper {
    position: relative;
    width: 140px;
    height: 140px;
  }
  .donut-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .donut-segment {
    transition: stroke-dasharray 0.5s, stroke-dashoffset 0.5s, filter 0.2s, opacity 0.2s;
  }
  .donut-center-text {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .donut-legend {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
  }
  .legend-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #ccc;
  }
  .legend-color {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    font-size: 0.75rem;
    color: #888;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--t-border);
    margin-bottom: 0.5rem;
    font-weight: 600;
  }
  .table-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr;
    font-size: 0.85rem;
    color: #ccc;
    padding: 0.8rem 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
</style>
