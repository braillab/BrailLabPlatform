// ¿Está en marcha el recorrido guiado? Mientras lo está, las páginas por las que
// pasa no dicen su introducción por voz (taparía la del recorrido) y atajos como
// la flecha derecha del camino de cursos no deben actuar.
let active = false;

export const setTourActive = (value) => {
    active = value;
    if (typeof document === 'undefined') return;
    if (value) document.body.dataset.tour = 'on';
    else delete document.body.dataset.tour;
};

export const isTourActive = () => active;
