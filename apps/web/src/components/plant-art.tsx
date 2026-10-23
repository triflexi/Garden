import type { PlantIcon } from '@/lib/api';
import { useId } from 'react';

export function PlantArt({
  kind = 'monstera',
  className = '',
}: {
  kind?: PlantIcon;
  className?: string;
}) {
  const prefix = `leaf-${useId().replaceAll(':', '')}`;
  return (
    <svg className={`plant-art ${className}`} viewBox="0 0 240 220" fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id={`${prefix}-pot`}
          x1="85"
          y1="160"
          x2="158"
          y2="216"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E6C8A3" />
          <stop offset="1" stopColor="#BB906A" />
        </linearGradient>
        <linearGradient
          id={`${prefix}-leaf`}
          x1="60"
          y1="30"
          x2="160"
          y2="145"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#75A478" />
          <stop offset="1" stopColor="#28553E" />
        </linearGradient>
        <linearGradient
          id={`${prefix}-light`}
          x1="150"
          y1="30"
          x2="80"
          y2="145"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#A2BB7E" />
          <stop offset="1" stopColor="#4F8050" />
        </linearGradient>
      </defs>
      <ellipse cx="121" cy="208" rx="57" ry="7" fill="#274A31" opacity=".08" />
      {kind === 'cactus' ? (
        <g stroke="#47704A" strokeWidth="3">
          <path d="M107 166V61C107 36 137 36 137 61V166" fill={`url(#${prefix}-leaf)`} />
          <path
            d="M107 125H86C71 125 69 115 69 103V88C69 75 85 75 85 88V104H107M137 108H158C173 108 175 97 175 87V77C175 64 159 64 159 77V90H137"
            fill={`url(#${prefix}-light)`}
          />
          <path d="M119 58V165M129 58V165" stroke="#B6CC99" strokeWidth="1.5" />
          <g stroke="#BDD1A6" strokeWidth="1">
            <path d="M109 73H114M130 84H136M109 99H114M130 110H136M109 126H114M130 141H136M72 90H80M163 80H169" />
          </g>
        </g>
      ) : kind === 'fern' || kind === 'palm' ? (
        <g>
          <path
            d="M121 170C115 120 116 75 118 47M121 167C100 112 82 89 57 72M121 165C143 111 160 89 187 77M121 166C96 142 68 130 43 129M123 167C149 137 173 124 200 125"
            stroke="#547D46"
            strokeWidth="3"
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <g key={i} transform={`translate(0 ${i * 16})`}>
              <path
                d={`M118 ${42 + i * 1}Q${78 - i * 2} ${22 + i * 2} ${80 - i * 2} ${45 + i * 2}Q103 ${65 + i} 118 ${62 + i}`}
                fill={`url(#${prefix}-leaf)`}
              />
              <path
                d={`M118 ${44 + i}Q${154 + i * 2} ${25 + i * 2} ${158 + i * 2} ${47 + i * 2}Q136 ${66 + i} 118 ${65 + i}`}
                fill={`url(#${prefix}-light)`}
              />
            </g>
          ))}
          <path
            d="M95 124C57 81 34 84 47 105C57 121 79 129 95 124M143 125C178 82 202 83 191 104C181 121 159 129 143 125"
            fill={`url(#${prefix}-leaf)`}
          />
        </g>
      ) : kind === 'ficus' ? (
        <g>
          <path d="M120 170C119 115 125 80 121 32" stroke="#836F45" strokeWidth="4" />
          {[
            { x: 91, y: 55, r: -35 },
            { x: 148, y: 77, r: 35 },
            { x: 88, y: 108, r: -50 },
            { x: 148, y: 127, r: 50 },
            { x: 120, y: 30, r: 5 },
          ].map((p, i) => (
            <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.r})`}>
              <ellipse rx="19" ry="33" fill={`url(#${prefix}-${i % 2 ? 'light' : 'leaf'})`} />
              <path d="M0 -26V30" stroke="#C3D3A3" opacity=".5" />
            </g>
          ))}
        </g>
      ) : kind === 'flower' ? (
        <g>
          <path
            d="M121 170V64M120 140C94 108 81 104 77 95M122 146C150 122 165 115 170 103"
            stroke="#547D46"
            strokeWidth="3"
          />
          <ellipse
            cx="92"
            cy="126"
            rx="28"
            ry="12"
            transform="rotate(35 92 126)"
            fill={`url(#${prefix}-leaf)`}
          />
          <ellipse
            cx="150"
            cy="139"
            rx="27"
            ry="12"
            transform="rotate(-35 150 139)"
            fill={`url(#${prefix}-light)`}
          />
          {[0, 60, 120, 180, 240, 300].map((angle) => (
            <ellipse
              key={angle}
              cx="120"
              cy="43"
              rx="12"
              ry="24"
              transform={`rotate(${angle} 120 65)`}
              fill="#D8A7A0"
            />
          ))}
          <circle cx="120" cy="65" r="12" fill="#D3AE63" />
        </g>
      ) : (
        <g>
          <path
            d="M121 172C117 120 103 98 79 67M122 171C132 117 155 92 166 57M121 167C120 107 126 74 125 29"
            stroke="#66814A"
            strokeWidth="3"
          />
          <path
            d="M83 117C42 116 27 88 36 66C46 42 65 50 79 63C89 43 112 42 116 68C120 91 105 113 83 117Z"
            fill={`url(#${prefix}-leaf)`}
          />
          <path
            d="M78 69L81 117M48 67L67 82M43 89L69 96M99 61L89 81M107 83L91 96"
            stroke="#B5CCA2"
            strokeWidth="2"
            opacity=".6"
          />
          <path
            d="M154 119C133 100 135 76 148 60C162 43 174 53 176 66C192 52 211 60 207 79C202 103 180 120 154 119Z"
            fill={`url(#${prefix}-light)`}
          />
          <path
            d="M175 67L154 119M153 70L158 89M193 70L177 86M194 92L171 103"
            stroke="#CBD6A7"
            strokeWidth="2"
            opacity=".7"
          />
          <path
            d="M125 84C101 72 100 47 111 30C121 15 136 18 139 33C155 26 169 41 160 55C150 73 138 82 125 84Z"
            fill={`url(#${prefix}-leaf)`}
          />
          <path
            d="M135 35L125 83M115 40L126 53M149 44L136 58"
            stroke="#BED1A4"
            strokeWidth="1.5"
            opacity=".65"
          />
        </g>
      )}
      <path d="M84 161H157L149 197C147 209 94 209 92 197L84 161Z" fill={`url(#${prefix}-pot)`} />
      <ellipse cx="120.5" cy="162" rx="37" ry="7" fill="#CCAA84" />
      <ellipse cx="120.5" cy="161" rx="30" ry="4" fill="#6F5C41" />
      <path d="M96 171L101 196M106 172L109 198" stroke="#F7E6CC" strokeWidth="3" opacity=".28" />
      <path d="M120 162V154" stroke="#66814A" strokeWidth="3" />
    </svg>
  );
}
