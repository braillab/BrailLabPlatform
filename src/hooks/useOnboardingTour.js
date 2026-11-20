import { useState, useEffect, useCallback } from 'react';
import { useAudio } from '../context/AudioContext';
import { useUser } from '../context/UserContext';
import { useAccessibility } from '../context/AccessibilityContext';
import { setTourActive } from '../utils/tourState';

// Cada paso puede:
//   selector  elemento a resaltar (null = tarjeta centrada, sin resaltar nada)
//   route     sección a la que llevar al usuario antes de mostrarlo
//   panel     true = abrir el panel de accesibilidad (si no, se cierra)
// El recorrido lleva a cada sección y baja hasta el elemento.
const STEPS = [
    {
        route: 'inicio',
        selector: null,
        title: '¡Hola! Soy Braulio',
        body: 'Te voy a enseñar la plataforma paso a paso, llevándote a cada sección. Puedes saltarlo cuando quieras.',
    },
    {
        route: 'inicio',
        selector: '[data-tour="learning-progress"]',
        title: 'Tu progreso',
        body: 'Aquí ves cuánto llevas y puedes continuar justo donde te quedaste.',
    },
    {
        route: 'cursos',
        selector: '[data-tour="course-cta"]',
        title: 'Tus cursos',
        body: 'Lecciones de Braille paso a paso: cómo funciona, las letras y al final los retos. Este botón te lleva justo donde te quedaste.',
    },
    {
        route: 'cuentos',
        selector: '[data-tour="stories-cards"]',
        title: 'Cuentos',
        body: 'Elige un cuento y léelo a tu manera: escúchalo conmigo, con el texto iluminándose, o léelo con los dedos en el display, con sonidos y vibraciones.',
    },
    {
        route: 'mensajes',
        selector: '[data-tour="messages-phone"]',
        title: 'Mensajes',
        body: 'Un familiar escribe un mensaje corto, ves cómo queda en Braille y lo envía al display para que lo leas con los dedos.',
    },
    {
        panel: true,
        selector: '[data-tour="a11y-voice"]',
        title: 'Accesibilidad',
        body: 'Aquí ajustas el contraste, el tamaño de letra y mi voz. Con "Narración breve" solo te digo dónde estás, sin leerte cada paso.',
    },
    {
        selector: '[data-voice-pill]',
        title: 'Háblame',
        body: 'Mantén presionada la tecla Ctrl izquierda, habla y suéltala. También puedes decir "Braulio" o tocar mi carita.',
    },
    {
        route: 'inicio',
        selector: null,
        title: 'Listo para empezar',
        body: 'Eso es todo. Puedes repetir este recorrido desde Accesibilidad cuando quieras.',
    },
];

// Hay elementos con el mismo data-tour en el menú de escritorio y en la barra
// inferior de móvil; solo uno es visible a la vez, así que buscamos el visible.
const findVisible = (selector) =>
    [...document.querySelectorAll(selector)].find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }) ?? null;

// Desplazamiento inmediato aunque la hoja de estilos pida "suave".
const scrollNow = (el) => {
    const root = document.documentElement;
    const previous = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    el.scrollIntoView({ block: 'center' });
    root.style.scrollBehavior = previous;
};

const useOnboardingTour = ({ onOpenPanel, onClosePanel } = {}) => {
    const { user, hasCompletedOnboarding, completeOnboarding } = useUser();
    const { speak, stop } = useAudio();
    const { reduceMotion } = useAccessibility() ?? {};

    const [stepIndex, setStepIndex] = useState(0);
    const [targetRect, setTargetRect] = useState(null);

    const isActive = !!user && !hasCompletedOnboarding;
    const step = STEPS[stepIndex];
    const isLastStep = stepIndex === STEPS.length - 1;

    // Mientras dura, las páginas no dicen su propia introducción.
    useEffect(() => {
        setTourActive(isActive);
        return () => setTourActive(false);
    }, [isActive]);

    // Reinicia al paso 1 cada vez que el tour se activa (primera vez, o al reabrirlo
    // desde "Ver el recorrido guiado de nuevo" en el panel de accesibilidad)
    useEffect(() => {
        if (isActive) setStepIndex(0);
    }, [isActive]);

    // Recalcula la posición del elemento a resaltar
    const updateRect = useCallback(() => {
        if (!step?.selector) {
            setTargetRect(null);
            return;
        }
        const el = findVisible(step.selector);
        // Si ninguno está visible, "sin objetivo": la tarjeta cae centrada en vez de mal ubicada.
        setTargetRect(el ? el.getBoundingClientRect() : null);
    }, [step]);

    useEffect(() => {
        if (!isActive) return undefined;
        updateRect();
        window.addEventListener('resize', updateRect);
        window.addEventListener('scroll', updateRect, true);
        // Cuando termina una animación (el panel de accesibilidad entrando, las
        // tarjetas apareciendo) el elemento ya está en su lugar definitivo.
        document.addEventListener('transitionend', updateRect, true);
        document.addEventListener('animationend', updateRect, true);
        return () => {
            window.removeEventListener('resize', updateRect);
            window.removeEventListener('scroll', updateRect, true);
            document.removeEventListener('transitionend', updateRect, true);
            document.removeEventListener('animationend', updateRect, true);
        };
    }, [isActive, updateRect]);

    // Lleva a la sección del paso, abre o cierra el panel y baja hasta el
    // elemento (espera a que exista: la página puede estar cargando).
    useEffect(() => {
        if (!isActive) return undefined;
        const pageChanges = !!step.route && !window.location.hash.startsWith(`#/${step.route}`);
        if (pageChanges) window.location.hash = `#/${step.route}`;
        if (step.panel) onOpenPanel?.();
        else onClosePanel?.();

        if (!step.selector) return undefined;
        let cancelled = false;
        let tries = 0;
        const timers = [];
        const later = (fn, ms) => timers.push(setTimeout(fn, ms));
        const settle = () => {
            if (cancelled) return;
            const el = findVisible(step.selector);
            if (!el) {
                if (tries < 25) {
                    tries += 1;
                    later(settle, 100);
                }
                return;
            }
            // Al cambiar de página se desplaza de golpe: la plataforma sube sola al inicio
            // con su propia animación y un desplazamiento suave se pisaría con ella.
            if (reduceMotion || pageChanges) scrollNow(el);
            else el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            updateRect();
            // Si el desplazamiento no dejó el elemento a la vista (otra animación lo
            // pisó, pestaña en segundo plano...), se hace de golpe; y el marco se
            // reajusta cuando terminan las animaciones (el panel tarda 300 ms en entrar).
            const ensure = () => {
                if (cancelled) return;
                const r = el.getBoundingClientRect();
                const fits = r.height <= window.innerHeight - 2 * 24;
                if (fits && (r.top < 24 || r.bottom > window.innerHeight - 24)) scrollNow(el);
                updateRect();
            };
            [700, 1300, 1900].forEach((ms) => later(ensure, ms));
        };
        // Un instante para que cambie la página y la plataforma suba al inicio por su cuenta.
        later(settle, 250);
        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, stepIndex]);

    // Narra cada paso en voz alta al mostrarse (respeta el mute del AudioContext)
    useEffect(() => {
        if (!isActive) return;
        speak(`${step.title}. ${step.body}`, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, stepIndex]);

    // Al terminar o saltar: cierra el panel y vuelve al inicio.
    const finish = () => {
        stop?.();
        onClosePanel?.();
        if (!window.location.hash.startsWith('#/inicio')) window.location.hash = '#/inicio';
        completeOnboarding();
    };

    const next = () => {
        if (isLastStep) {
            finish();
            return;
        }
        setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    };

    const prev = () => setStepIndex((i) => Math.max(i - 1, 0));

    const skip = () => finish();

    // Atajos de teclado: Escape salta el tour, flechas avanzan/retroceden
    useEffect(() => {
        if (!isActive) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') skip();
            if (e.key === 'ArrowRight' || e.key === 'Enter') next();
            if (e.key === 'ArrowLeft') prev();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive, stepIndex]);

    return {
        isActive,
        step,
        stepIndex,
        totalSteps: STEPS.length,
        isLastStep,
        targetRect,
        next,
        prev,
        skip,
    };
};

export default useOnboardingTour;
