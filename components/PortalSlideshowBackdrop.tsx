'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { PortalScope } from '@/lib/portal-routing';

export interface SlideshowSlide {
  src: string;
  alt: string;
  caption: string;
  detail: string;
}

const TEACHER_SLIDES: SlideshowSlide[] = [
  {
    src: '/images/teacher_classroom_black.jpg',
    alt: 'Black female teacher teaching mathematics in a modern classroom at Juneberries International Schools',
    caption: 'Classroom Instruction',
    detail: 'Dedicated educators guiding students across Primary 1 to SSS 3',
  },
  {
    src: '/images/teacher_science_lab_black.jpg',
    alt: 'Black male science teacher demonstrating practical titration in the school laboratory',
    caption: 'Science & Laboratory Practicals',
    detail: 'Hands-on Physics, Chemistry & Biology instruction in the school lab',
  },
  {
    src: '/images/teacher_exam_invigilating_black.jpg',
    alt: 'Black male teacher invigilating students taking computer-based examinations',
    caption: 'CBT Examination Invigilation',
    detail: 'Structured computer-based assessment supervision and academic integrity',
  },
];

const STUDENT_SLIDES: SlideshowSlide[] = [
  {
    src: '/images/students_cbt_diverse_study.jpg',
    alt: 'Black and diverse students studying together on computers and tablets at Juneberries International Schools',
    caption: 'Digital Learning Commons',
    detail: 'Students preparing for quizzes, assessments, and CBT examinations',
  },
  {
    src: '/images/teacher_classroom_black.jpg',
    alt: 'Students participating actively in class with their teacher',
    caption: 'Interactive Classroom Sessions',
    detail: 'Focused subject mastery across Primary, JSS, and Senior Secondary',
  },
  {
    src: '/images/teacher_exam_invigilating_black.jpg',
    alt: 'Students seated in the digital examination hall completing CBT tests',
    caption: 'Live CBT Examination Hall',
    detail: 'Real-time timed assessments with instant subject readiness tracking',
  },
];

const ALL_CAMPUS_SLIDES: SlideshowSlide[] = [
  TEACHER_SLIDES[0],
  STUDENT_SLIDES[0],
  TEACHER_SLIDES[1],
  TEACHER_SLIDES[2],
];

export function getSlidesForScope(scope: PortalScope | 'authenticated_teacher' | 'authenticated_student' | 'authenticated_admin'): SlideshowSlide[] {
  if (
    scope === 'teacher' ||
    scope === 'teacher_register' ||
    scope === 'questions' ||
    scope === 'authenticated_teacher'
  ) {
    return TEACHER_SLIDES;
  }
  if (
    scope === 'student' ||
    scope === 'student_register' ||
    scope === 'authenticated_student'
  ) {
    return STUDENT_SLIDES;
  }
  return ALL_CAMPUS_SLIDES;
}

export type SlideshowScope =
  | PortalScope
  | 'authenticated_teacher'
  | 'authenticated_student'
  | 'authenticated_admin';

interface PortalSlideshowBackdropProps {
  scope: SlideshowScope;
  activeIndex?: number;
}

export function usePortalSlideshow(scope: SlideshowScope, intervalMs = 5200) {
  const slides = useMemo(() => getSlidesForScope(scope), [scope]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [paused, slides.length, intervalMs]);

  return {
    slides,
    activeIndex,
    setActiveIndex,
    paused,
    togglePause: () => setPaused((p) => !p),
    nextSlide: () => setActiveIndex((prev) => (prev + 1) % slides.length),
    prevSlide: () => setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length),
  };
}

export function PortalSlideshowBackdrop({
  scope,
  activeIndex,
}: PortalSlideshowBackdropProps) {
  const { slides, activeIndex: autoIndex } = usePortalSlideshow(scope, 5200);
  const resolvedIndex = activeIndex !== undefined ? activeIndex : autoIndex;

  return (
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 overflow-hidden bg-[#160A33] pointer-events-none"
      >
        {slides.map((slide, idx) => {
          const isActive = idx === resolvedIndex % slides.length;
          return (
            <div
              key={slide.src}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={slide.src}
                alt={slide.alt}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover animate-ken-burns"
              />
            </div>
          );
        })}
        {/* Luminous purple-navy atmospheric scrim preserves live photography clarity and foreground contrast */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#2E1065]/72 via-[#0A1E3D]/48 to-[#4C1D95]/72" />
      </div>
  );
}

interface SlideshowSubheadingHeroProps {
  scope: PortalScope | 'authenticated_teacher' | 'authenticated_student' | 'authenticated_admin';
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
  compact?: boolean;
}

export function SlideshowSubheadingHero({
  scope,
  eyebrow,
  title,
  subtitle,
  children,
  compact = false,
}: SlideshowSubheadingHeroProps) {
  const { slides, activeIndex, setActiveIndex, paused, togglePause, nextSlide, prevSlide } =
    usePortalSlideshow(scope, 4800);
  const current = slides[activeIndex % slides.length];

  return (
    <section
      className={`relative rounded-2xl overflow-hidden border border-[#FACC15]/30 text-white shadow-xl ${
        compact ? 'min-h-[190px]' : 'min-h-[260px]'
      }`}
    >
      {/* Interactive Video-Like Photo Slideshow Layer */}
      <div className="absolute inset-0 bg-[#1E103D]">
        {slides.map((slide, idx) => {
          const isActive = idx === activeIndex % slides.length;
          return (
            <div
              key={slide.src}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                isActive ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <img
                src={slide.src}
                alt={slide.alt}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover animate-ken-burns"
              />
            </div>
          );
        })}
        <div className="absolute inset-0 bg-gradient-to-r from-[#2E1065]/88 via-[#0A1E3D]/68 to-[#4C1D95]/35" />
      </div>

      {/* Foreground Subheading Copy & Interactive Slide Controls */}
      <div className="relative z-10 p-6 lg:p-8 flex flex-col justify-between gap-4 h-full">
        <div className="max-w-2xl space-y-2.5">
          <div className="text-xs font-bold text-[#FACC15] tracking-wider uppercase">
            {eyebrow}
          </div>
          <h2 className="font-display text-2xl lg:text-3xl font-bold leading-tight text-balance">
            {title}
          </h2>
          <p className="text-purple-50 text-sm leading-relaxed">{subtitle}</p>
        </div>

        {children && <div className="pt-1">{children}</div>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/15">
          <div className="text-xs text-purple-100 min-w-0">
            <span className="font-bold text-[#FACC15]">{current.caption}</span>
            <span className="hidden sm:inline text-purple-200"> — {current.detail}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              aria-label="Previous slide"
              onClick={prevSlide}
              className="p-1.5 rounded-md bg-[#1E103D]/60 hover:bg-[#4C1D95]/80 text-white border border-white/25 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
              onClick={togglePause}
              className="p-1.5 rounded-md bg-[#1E103D]/60 hover:bg-[#4C1D95]/80 text-white border border-white/25 transition-colors"
            >
              {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={nextSlide}
              className="p-1.5 rounded-md bg-[#1E103D]/60 hover:bg-[#4C1D95]/80 text-white border border-white/25 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1 ml-1">
              {slides.map((s, i) => (
                <button
                  key={s.src}
                  type="button"
                  aria-label={`View slide ${i + 1}: ${s.caption}`}
                  onClick={() => setActiveIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === activeIndex % slides.length
                      ? 'w-5 bg-[#FACC15]'
                      : 'w-2 bg-white/45 hover:bg-white/75'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
