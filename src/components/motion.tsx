'use client';
import { motion, useReducedMotion } from 'motion/react';
export function Reveal({
  children,
  className = '',
  from = 'bottom',
}: {
  children: React.ReactNode;
  className?: string;
  from?: 'bottom' | 'left';
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      data-reveal-from={from}
      initial={reduce ? false : from === 'left' ? { x: -24, opacity: 0 } : { y: 10 }}
      whileInView={{ x: 0, y: 0, opacity: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.div>
  );
}
