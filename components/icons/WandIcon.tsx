
import React from 'react';

const WandIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M15 4V2" />
    <path d="M15 10V8" />
    <path d="M12.5 7.5h-1" />
    <path d="M7.5 12.5v-1" />
    <path d="M4 15H2" />
    <path d="M10 15H8" />
    <path d="M5.5 16.5-1 23" />
    <path d="m20 5-3 3" />
    <path d="M17.5 8.5 14 12" />
    <path d="m23 1-5.5 5.5" />
    <path d="M12 14s1.5 2 4 2 4-2 4-2" />
  </svg>
);

export default WandIcon;
