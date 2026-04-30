class Calendario {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) throw new Error(`Elemento #${containerId} no encontrado`);

    this.mode = options.mode || 'readonly'; // 'admin' | 'client' | 'readonly'
    this.onSelect = options.onSelect || (() => {});
    this.onDayClick = options.onDayClick || null;

    this.estadoDias = {};
    this.selStart = null;
    this.selEnd = null;

    const now = new Date();
    this.currentYear = options.year || now.getFullYear();
    this.currentMonth = options.month || (now.getMonth() + 1);

    this._render();
    this.loadMonth(this.currentYear, this.currentMonth);
  }

  async loadMonth(year, month) {
    this.currentYear = year;
    this.currentMonth = month;
    try {
      const res = await fetch(`/api/disponibilidad?year=${year}&month=${month}`);
      this.estadoDias = await res.json();
    } catch (e) {
      console.error('Error cargando disponibilidad:', e);
      this.estadoDias = {};
    }
    this._renderGrid();
  }

  _render() {
    this.container.innerHTML = `
      <div class="calendario-wrapper">
        <div class="calendario-header">
          <button class="btn-mes" id="${this.container.id}-prev">&#8249;</button>
          <h3 id="${this.container.id}-titulo">Cargando...</h3>
          <button class="btn-mes" id="${this.container.id}-next">&#8250;</button>
        </div>
        <div class="calendario-dias-semana">
          <span>Dom</span><span>Lun</span><span>Mar</span>
          <span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span>
        </div>
        <div class="calendario-grid" id="${this.container.id}-grid"></div>
        <div class="leyenda" id="${this.container.id}-leyenda"></div>
      </div>
    `;

    document.getElementById(`${this.container.id}-prev`).addEventListener('click', () => {
      let m = this.currentMonth - 1, y = this.currentYear;
      if (m < 1) { m = 12; y--; }
      this.loadMonth(y, m);
    });

    document.getElementById(`${this.container.id}-next`).addEventListener('click', () => {
      let m = this.currentMonth + 1, y = this.currentYear;
      if (m > 12) { m = 1; y++; }
      this.loadMonth(y, m);
    });

    this._renderLeyenda();
  }

  _renderGrid() {
    const gridEl = document.getElementById(`${this.container.id}-grid`);
    const tituloEl = document.getElementById(`${this.container.id}-titulo`);

    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    tituloEl.textContent = `${MESES[this.currentMonth - 1]} ${this.currentYear}`;

    // Primer día de semana del mes (0=Dom)
    const primerDia = new Date(this.currentYear, this.currentMonth - 1, 1).getDay();
    const diasEnMes = new Date(this.currentYear, this.currentMonth, 0).getDate();
    const hoy = new Date().toISOString().slice(0, 10);

    let html = '';

    // Espacios vacíos antes del primer día
    for (let i = 0; i < primerDia; i++) {
      html += '<div class="dia dia--vacio"></div>';
    }

    for (let d = 1; d <= diasEnMes; d++) {
      const dateStr = `${this.currentYear}-${String(this.currentMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const estado = this.estadoDias[dateStr] || 'disponible';
      const esPasado = dateStr < hoy;
      const tooltip = this._tooltipTexto(dateStr, estado, esPasado);

      let clases = 'dia';
      if (esPasado) {
        clases += ' dia--pasado';
      } else if (dateStr === this.selStart && dateStr === this.selEnd) {
        clases += ' dia--seleccionado-inicio dia--seleccionado-fin';
      } else if (dateStr === this.selStart) {
        clases += ' dia--seleccionado-inicio';
      } else if (dateStr === this.selEnd) {
        clases += ' dia--seleccionado-fin';
      } else if (this.selStart && this.selEnd && dateStr > this.selStart && dateStr < this.selEnd) {
        clases += ' dia--en-rango';
      } else {
        clases += ` dia--${estado}`;
      }

      html += `
        <div class="${clases}" data-date="${dateStr}" title="">
          ${d}
          <span class="calendario-tooltip">${tooltip}</span>
        </div>`;
    }

    gridEl.innerHTML = html;

    // Eventos de clic en los días
    gridEl.querySelectorAll('.dia[data-date]').forEach(el => {
      el.addEventListener('click', () => {
        const dateStr = el.dataset.date;
        if (el.classList.contains('dia--pasado')) return;
        this.handleDayClick(dateStr);
      });
    });
  }

  _tooltipTexto(dateStr, estado, esPasado) {
    if (esPasado) return 'Fecha pasada';
    if (this.mode === 'client') {
      if (estado === 'disponible') return 'Disponible — clic para seleccionar';
      return 'No disponible';
    }
    // Admin / readonly — muestra razón real
    const textos = {
      disponible: 'Disponible',
      reservada: 'Reservado',
      bloqueado: 'Bloqueado — uso personal',
      mantenimiento: 'En mantenimiento',
    };
    return textos[estado] || estado;
  }

  handleDayClick(dateStr) {
    const estado = this.estadoDias[dateStr] || 'disponible';

    // En modo cliente, solo disponibles son clickeables
    if (this.mode === 'client' && estado !== 'disponible') return;

    // En modo admin, clic en reservado → callback especial
    if (this.mode === 'admin' && this.onDayClick) {
      this.onDayClick(dateStr, estado);
    }

    if (!this.selStart || (this.selStart && this.selEnd)) {
      // Primer clic — establecer inicio
      this.selStart = dateStr;
      this.selEnd = null;
      this._renderGrid();
      this.onSelect({ tipo: 'inicio', entrada: dateStr });
      return;
    }

    if (dateStr <= this.selStart) {
      // Clic antes del inicio → reiniciar
      this.selStart = dateStr;
      this.selEnd = null;
      this._renderGrid();
      this.onSelect({ tipo: 'inicio', entrada: dateStr });
      return;
    }

    // Segundo clic — verificar que no haya días ocupados en el rango
    if (this.mode === 'client') {
      const diasRango = this._diasEntre(this.selStart, dateStr);
      const hayConflicto = diasRango.some(d => {
        const est = this.estadoDias[d] || 'disponible';
        return est !== 'disponible';
      });
      if (hayConflicto) {
        this.onSelect({ tipo: 'error', mensaje: 'Hay días no disponibles en ese rango. Elige otro.' });
        return;
      }
    }

    this.selEnd = dateStr;
    this._renderGrid();
    this.onSelect({ tipo: 'rango', entrada: this.selStart, salida: this.selEnd });
  }

  _diasEntre(inicio, fin) {
    const dias = [];
    const cur = new Date(inicio + 'T12:00:00');
    const end = new Date(fin + 'T12:00:00');
    cur.setDate(cur.getDate() + 1); // no incluye el día de inicio
    while (cur < end) {              // no incluye el día final
      dias.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    return dias;
  }

  clearSelection() {
    this.selStart = null;
    this.selEnd = null;
    this._renderGrid();
  }

  getSelection() {
    return { entrada: this.selStart, salida: this.selEnd };
  }

  _renderLeyenda() {
    const el = document.getElementById(`${this.container.id}-leyenda`);
    if (!el) return;

    if (this.mode === 'client') {
      el.innerHTML = `
        <div class="leyenda-item"><div class="leyenda-dot leyenda-dot--disponible"></div> Disponible</div>
        <div class="leyenda-item"><div class="leyenda-dot leyenda-dot--reservada"></div> No disponible</div>
      `;
    } else {
      el.innerHTML = `
        <div class="leyenda-item"><div class="leyenda-dot leyenda-dot--disponible"></div> Disponible</div>
        <div class="leyenda-item"><div class="leyenda-dot leyenda-dot--reservada"></div> Reservado</div>
        <div class="leyenda-item"><div class="leyenda-dot leyenda-dot--bloqueado"></div> Bloqueado</div>
        <div class="leyenda-item"><div class="leyenda-dot leyenda-dot--mantenimiento"></div> Mantenimiento</div>
      `;
    }
  }
}
