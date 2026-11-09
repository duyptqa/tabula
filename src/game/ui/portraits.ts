// SVG character art ported from the TABULA design boards (Itsuki, Lethe and the Chibi component),
// plus a few simple portraits for the non-human cast.

export type Look = 'spiky' | 'long' | 'bob' | 'hood';

export interface ChibiSpec {
    look: Look;
    hair: string;
    outfit: string;
    trim: string;
    eye: string;
    skin: string;
    glasses?: boolean;
    horns?: boolean;
    crown?: boolean;
    mask?: boolean;
    cape?: boolean;
}

const svgOpen = (size: number, label: string) =>
    `<svg viewBox="0 0 200 280" width="${size}" height="${Math.round(size * 1.4)}" role="img" aria-label="${label}" style="display:block;overflow:visible">`;

export function itsukiSvg(size: number, streak = 1, mirror = false): string {
    const hair = mirror ? '#CFC8EA' : '#3F4E9E';
    const scarf = mirror ? '#FF7AB6' : '#3BB3C8';
    const scarf2 = mirror ? '#FF8DC0' : '#4FC9DD';
    const scarfLine = mirror ? '#B0306E' : '#1E6E7C';
    const iris = mirror ? '#FF3D8B' : '#E8A33D';
    const pupil = mirror ? '#7A2A4A' : '#7A4310';
    const coat = mirror ? '#4A4370' : '#EADFC8';
    const coat2 = mirror ? '#3A3366' : '#D8CBAE';
    const sleeve = mirror ? '#4A4370' : '#DDD0B2';
    const s2 = streak >= 2 ? 1 : 0;
    const s3 = streak >= 3 ? 1 : 0;
    return `${svgOpen(size, mirror ? 'Mirror Itsuki' : 'Itsuki')}
<ellipse cx="100" cy="266" rx="46" ry="7" fill="#000" opacity="0.28"/>
<path d="M124 170 Q156 172 174 200 Q178 210 176 218 Q166 214 158 206 Q148 190 126 184 Z" fill="${scarf}"/>
<path d="M38 106 Q34 38 100 32 Q166 38 162 106 Q162 140 148 152 L52 152 Q38 140 38 106 Z" fill="${hair}"/>
<rect x="80" y="230" width="17" height="28" rx="6" fill="#2B2547"/><rect x="103" y="230" width="17" height="28" rx="6" fill="#2B2547"/>
<path d="M76 250 h24 v9 a4 4 0 0 1 -4 4 h-17 a3 3 0 0 1 -3 -3 z" fill="#6B4632"/><path d="M100 250 h24 v10 a3 3 0 0 1 -3 3 h-17 a4 4 0 0 1 -4 -4 z" fill="#6B4632"/>
<rect x="48" y="214" width="30" height="25" rx="5" fill="#8A5E3F"/>
<path d="M54 214 V205 Q54 199 61 199 Q68 199 68 205 V214 Z" fill="#8E89AE"/>
<path d="M58 206 h6 M58 210 h6" stroke="#8FF3FF" stroke-width="1.6" stroke-linecap="round"/>
<path d="M48 221 h30 v-3 a4 4 0 0 0 -4 -4 h-22 a4 4 0 0 0 -4 4 z" fill="#6E4730"/>
<rect x="92" y="148" width="16" height="24" fill="#F0CDB8"/>
<path d="M66 174 Q100 162 134 174 L142 234 Q100 246 58 234 Z" fill="${coat}"/>
<path d="M118 168 Q130 170 134 174 L142 234 Q132 238 122 240 Z" fill="${coat2}"/>
<path d="M92 172 L108 172 L104 240 L96 240 Z" fill="#2E2A55"/>
<path d="M92 172 L98 200 M108 172 L102 200" stroke="#C9B994" stroke-width="2" stroke-linecap="round"/>
<path d="M61 206 L139 206 L140 214 L60 214 Z" fill="#7A5236"/><rect x="95" y="204" width="10" height="12" rx="2" fill="#E8C46A"/>
<path d="M128 176 L70 214" stroke="#7A5236" stroke-width="5" stroke-linecap="round"/>
<path d="M70 178 Q54 198 56 220 Q62 226 70 222 Q70 204 80 190 Z" fill="${sleeve}"/><circle cx="62" cy="222" r="7" fill="#FBE3D3"/>
<path d="M130 178 Q146 198 144 220 Q138 226 130 222 Q130 204 120 190 Z" fill="${sleeve}"/><circle cx="138" cy="222" r="7" fill="#FBE3D3"/>
<circle cx="138" cy="222" r="11" fill="none" stroke="#FF7AB6" stroke-width="2"/>
<path d="M138 216 l1.8 4.2 l4.2 1.8 l-4.2 1.8 l-1.8 4.2 l-1.8 -4.2 l-4.2 -1.8 l4.2 -1.8 z" fill="#FF7AB6"/>
<path d="M68 166 Q100 184 132 166 Q136 178 130 186 Q100 198 70 186 Q64 178 68 166 Z" fill="${scarf2}"/>
<path d="M82 178 h7 M96 182 h9 M111 178 h7" stroke="${scarfLine}" stroke-width="2.5" stroke-linecap="round"/>
<path d="M114 184 L128 218 L115 221 L106 188 Z" fill="${scarf}"/>
<path d="M116 210 l8 -2 M118 216 l8 -2" stroke="${scarfLine}" stroke-width="2" stroke-linecap="round"/>
<ellipse cx="47" cy="114" rx="7" ry="10" fill="#F6D2BE"/><ellipse cx="153" cy="114" rx="7" ry="10" fill="#F6D2BE"/>
<ellipse cx="100" cy="110" rx="54" ry="48" fill="#FBE3D3"/>
<path d="M44 104 Q42 44 100 38 Q158 44 156 104 L148 86 L140 104 L130 78 L119 100 L106 72 L95 98 L82 76 L72 102 L60 84 L52 106 Z" fill="${hair}"/>
<path d="M44 98 Q40 128 48 146 L54 120 Z" fill="${hair}"/><path d="M156 98 Q160 128 152 146 L146 120 Z" fill="${hair}"/>
<path d="M106 40 Q113 52 114 68 L106 72 Q108 56 106 40 Z" fill="#F4F1FF"/>
<path d="M100 38 Q119 48 119 100 L106 72 Q104 54 100 38 Z" fill="#F4F1FF" opacity="${s2}"/>
<path d="M60 50 Q78 42 92 40 Q84 60 82 76 L72 102 L60 84 Q58 66 60 50 Z" fill="#F4F1FF" opacity="${s3}"/>
<path d="M100 40 Q94 18 114 12 Q104 26 108 40 Z" fill="${hair}"/>
<path d="M62 64 Q76 50 92 48" stroke="${mirror ? '#F7F5FF' : '#6E7DD0'}" stroke-width="4" fill="none" stroke-linecap="round"/>
<ellipse cx="78" cy="120" rx="10.5" ry="13.5" fill="#22183A"/><ellipse cx="78" cy="123" rx="8" ry="9.5" fill="${iris}"/>
<ellipse cx="78" cy="125" rx="4" ry="5" fill="${pupil}"/><circle cx="74.5" cy="116" r="3.6" fill="#fff"/><circle cx="82" cy="128" r="1.7" fill="#fff"/>
<ellipse cx="122" cy="120" rx="10.5" ry="13.5" fill="#22183A"/><ellipse cx="122" cy="123" rx="8" ry="9.5" fill="${iris}"/>
<ellipse cx="122" cy="125" rx="4" ry="5" fill="${pupil}"/><circle cx="118.5" cy="116" r="3.6" fill="#fff"/><circle cx="126" cy="128" r="1.7" fill="#fff"/>
<path d="M66 110 Q78 102 90 110 M110 110 Q122 102 134 110" stroke="#22183A" stroke-width="3.5" fill="none" stroke-linecap="round"/>
<path d="M68 98 Q78 93 88 97 M112 97 Q122 93 132 98" stroke="#2E3A7A" stroke-width="3" fill="none" stroke-linecap="round"/>
<ellipse cx="64" cy="140" rx="7" ry="3.5" fill="#FF9DB0" opacity="0.55"/><ellipse cx="136" cy="140" rx="7" ry="3.5" fill="#FF9DB0" opacity="0.55"/>
<path d="M94 142 Q100 147 107 141" stroke="#7A3A3A" stroke-width="2.5" fill="none" stroke-linecap="round"/>
</svg>`;
}

export function letheSvg(size: number): string {
    return `${svgOpen(size, 'Lethe')}
<ellipse cx="100" cy="270" rx="28" ry="5" fill="#000" opacity="0.22"/>
<path d="M80 182 Q50 150 24 160 Q34 168 30 180 Q42 178 44 192 Q58 184 80 196 Z" fill="#3A1840"/>
<path d="M80 184 Q54 160 36 166 Q42 172 40 180 Q50 180 52 188 Q64 184 80 192 Z" fill="#B44C8C" opacity="0.75"/>
<path d="M120 182 Q150 150 176 160 Q166 168 170 180 Q158 178 156 192 Q142 184 120 196 Z" fill="#3A1840"/>
<path d="M120 184 Q146 160 164 166 Q158 172 160 180 Q150 180 148 188 Q136 184 120 192 Z" fill="#B44C8C" opacity="0.75"/>
<path d="M114 232 Q146 246 156 222 Q162 206 150 197" stroke="#3A1840" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M150 198 C141 191 140 182 146 180 C149 179 150 182 150 183 C150 182 151 179 154 180 C160 182 159 191 150 198 Z" fill="#FF7AB6"/>
<path d="M40 104 Q36 36 100 32 Q164 36 160 104 Q166 150 152 178 Q140 170 136 150 L64 150 Q60 170 48 178 Q34 150 40 104 Z" fill="#F28DBA"/>
<rect x="87" y="226" width="11" height="24" rx="5" fill="#2A1430"/><rect x="102" y="226" width="11" height="24" rx="5" fill="#2A1430"/>
<ellipse cx="92" cy="252" rx="8" ry="5" fill="#FF7AB6"/><ellipse cx="108" cy="252" rx="8" ry="5" fill="#FF7AB6"/>
<rect x="93" y="146" width="14" height="24" fill="#F5D3C6"/>
<path d="M74 176 Q100 166 126 176 L144 230 Q100 244 56 230 Z" fill="#6B2F7A"/>
<path d="M114 172 Q122 173 126 176 L144 230 Q136 234 126 236 Z" fill="#5A2768"/>
<path d="M56 230 Q100 244 144 230 L146 236 Q100 252 54 236 Z" fill="#FF9CC8"/>
<path d="M80 172 Q100 188 120 172 Q118 186 100 192 Q82 186 80 172 Z" fill="#F7EEF8"/>
<path d="M100 192 L90 186 L90 198 Z M100 192 L110 186 L110 198 Z" fill="#FF7AB6"/><circle cx="100" cy="192" r="3" fill="#E0408A"/>
<circle cx="100" cy="208" r="4.5" fill="#FF7AB6"/><path d="M97.5 210 L102.5 210 L104 220 L96 220 Z" fill="#FF7AB6"/>
<path d="M76 178 Q58 192 54 214 Q62 224 76 218 Q76 200 86 188 Z" fill="#7E3A8E"/><path d="M54 214 Q62 224 76 218 L77 222 Q62 230 52 219 Z" fill="#FF9CC8"/>
<path d="M124 178 Q142 192 146 214 Q138 224 124 218 Q124 200 114 188 Z" fill="#7E3A8E"/><path d="M146 214 Q138 224 124 218 L123 222 Q138 230 148 219 Z" fill="#FF9CC8"/>
<circle cx="54" cy="50" r="17" fill="#FFB3D1"/><circle cx="146" cy="50" r="17" fill="#FFB3D1"/>
<path d="M44 44 Q50 38 58 38 M136 38 Q144 38 150 44" stroke="#FFE0EE" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M70 50 Q56 28 70 14 Q68 30 82 44 Z" fill="#3A1840"/><path d="M130 50 Q144 28 130 14 Q132 30 118 44 Z" fill="#3A1840"/>
<path d="M66 26 Q66 20 70 16 M134 26 Q134 20 130 16" stroke="#C25A96" stroke-width="2" fill="none" stroke-linecap="round"/>
<ellipse cx="100" cy="108" rx="52" ry="47" fill="#FFE7DC"/>
<path d="M46 102 Q46 44 100 40 Q154 44 154 102 Q146 92 140 74 Q132 94 118 98 Q114 80 104 68 Q98 90 82 96 Q78 82 66 76 Q60 94 46 102 Z" fill="#FFB3D1"/>
<path d="M46 98 Q40 132 52 156 Q56 132 58 106 Z" fill="#FFB3D1"/><path d="M154 98 Q160 132 148 156 Q144 132 142 106 Z" fill="#FFB3D1"/>
<path d="M66 60 Q82 50 98 50" stroke="#FFE0EE" stroke-width="4" fill="none" stroke-linecap="round"/>
<ellipse cx="78" cy="118" rx="11.5" ry="14" fill="#3A1840"/><ellipse cx="78" cy="121" rx="9" ry="10.5" fill="#E0408A"/>
<ellipse cx="78" cy="126" rx="6" ry="4.5" fill="#FF8DC0"/><ellipse cx="78" cy="120" rx="1.8" ry="6" fill="#3A1840"/>
<circle cx="73.5" cy="113" r="4" fill="#fff"/><circle cx="83" cy="126" r="1.8" fill="#fff"/>
<ellipse cx="122" cy="118" rx="11.5" ry="14" fill="#3A1840"/><ellipse cx="122" cy="121" rx="9" ry="10.5" fill="#E0408A"/>
<ellipse cx="122" cy="126" rx="6" ry="4.5" fill="#FF8DC0"/><ellipse cx="122" cy="120" rx="1.8" ry="6" fill="#3A1840"/>
<circle cx="117.5" cy="113" r="4" fill="#fff"/><circle cx="127" cy="126" r="1.8" fill="#fff"/>
<path d="M65 108 Q78 99 91 108 M65 108 l-4 -3 M109 108 Q122 99 135 108 M135 108 l4 -3" stroke="#3A1840" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M71 95 Q78 92 85 94 M115 94 Q122 92 129 95" stroke="#E07AA8" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<ellipse cx="64" cy="136" rx="8" ry="4" fill="#FF7AB6" opacity="0.5"/><ellipse cx="136" cy="136" rx="8" ry="4" fill="#FF7AB6" opacity="0.5"/>
<path d="M93 136 Q100 145 107 136 Q100 139 93 136 Z" fill="#7A2A4A"/><path d="M96 137 L98 141.5 L100 137.6 Z" fill="#fff"/>
</svg>`;
}

export function chibiSvg(size: number, p: ChibiSpec, label = 'A chibi character'): string {
    const o = (b: boolean | undefined) => (b ? 1 : 0);
    const look = p.look;
    const oLong = o(look === 'long');
    const oShort = o(look === 'spiky' || look === 'bob');
    const oHood = o(look === 'hood');
    const oSpiky = o(look === 'spiky');
    const oSmooth = o(look !== 'spiky');
    const oSide = o(look === 'bob' || look === 'long');
    return `${svgOpen(size, label)}
<ellipse cx="100" cy="266" rx="46" ry="7" fill="#000" opacity="0.28"/>
<path d="M64 170 Q100 158 136 170 L158 254 Q100 266 42 254 Z" fill="${p.trim}" opacity="${o(p.cape)}"/>
<path d="M68 172 Q100 162 132 172 L150 250 Q100 260 50 250 Z" fill="${p.outfit}" opacity="${o(p.cape)}"/>
<path d="M40 104 Q36 36 100 32 Q164 36 160 104 Q166 160 150 196 L50 196 Q34 160 40 104 Z" fill="${p.hair}" opacity="${oLong}"/>
<path d="M40 106 Q36 38 100 32 Q164 38 160 106 Q160 140 148 152 L52 152 Q40 140 40 106 Z" fill="${p.hair}" opacity="${oShort}"/>
<path d="M32 112 Q28 26 100 22 Q172 26 168 112 Q168 152 150 164 L50 164 Q32 152 32 112 Z" fill="${p.outfit}" opacity="${oHood}"/>
<rect x="80" y="230" width="17" height="28" rx="6" fill="#231E3A"/><rect x="103" y="230" width="17" height="28" rx="6" fill="#231E3A"/>
<path d="M76 250 h24 v9 a4 4 0 0 1 -4 4 h-17 a3 3 0 0 1 -3 -3 z" fill="#3A3150"/><path d="M100 250 h24 v10 a3 3 0 0 1 -3 3 h-17 a4 4 0 0 1 -4 -4 z" fill="#3A3150"/>
<rect x="92" y="148" width="16" height="24" fill="${p.skin}"/>
<path d="M66 174 Q100 162 134 174 L144 236 Q100 248 56 236 Z" fill="${p.outfit}"/>
<path d="M118 168 Q130 170 134 174 L144 236 Q134 240 122 242 Z" fill="#000" opacity="0.14"/>
<path d="M56 236 Q100 248 144 236 L145 242 Q100 254 55 242 Z" fill="${p.trim}"/>
<path d="M100 178 V244" stroke="${p.trim}" stroke-width="3"/>
<path d="M82 170 Q100 182 118 170" stroke="${p.trim}" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M70 178 Q54 198 56 220 Q62 226 70 222 Q70 204 80 190 Z" fill="${p.outfit}"/><circle cx="62" cy="222" r="7" fill="${p.skin}"/>
<path d="M130 178 Q146 198 144 220 Q138 226 130 222 Q130 204 120 190 Z" fill="${p.outfit}"/><circle cx="138" cy="222" r="7" fill="${p.skin}"/>
<ellipse cx="100" cy="110" rx="54" ry="48" fill="${p.skin}"/>
<path d="M44 104 Q42 44 100 38 Q158 44 156 104 L148 86 L140 104 L130 78 L119 100 L106 72 L95 98 L82 76 L72 102 L60 84 L52 106 Z" fill="${p.hair}" opacity="${oSpiky}"/>
<path d="M46 104 Q46 44 100 40 Q154 44 154 104 Q148 86 136 78 Q126 92 112 96 Q108 80 100 72 Q92 86 80 94 Q72 80 64 78 Q54 90 46 104 Z" fill="${p.hair}" opacity="${oSmooth}"/>
<path d="M46 98 Q40 136 56 152 L60 108 Z M154 98 Q160 136 144 152 L140 108 Z" fill="${p.hair}" opacity="${oSide}"/>
<path d="M40 112 Q38 34 100 30 Q162 34 160 112 Q152 70 100 64 Q48 70 40 112 Z" fill="${p.outfit}" opacity="${oHood}"/>
<path d="M40 112 Q48 70 100 64 Q152 70 160 112" stroke="${p.trim}" stroke-width="3" fill="none" opacity="${oHood}"/>
<ellipse cx="78" cy="120" rx="10.5" ry="13.5" fill="#22183A"/><ellipse cx="78" cy="123" rx="8" ry="9.5" fill="${p.eye}"/>
<ellipse cx="78" cy="125" rx="4" ry="5" fill="#22183A" opacity="0.55"/><circle cx="74.5" cy="116" r="3.6" fill="#fff"/><circle cx="82" cy="128" r="1.7" fill="#fff"/>
<ellipse cx="122" cy="120" rx="10.5" ry="13.5" fill="#22183A"/><ellipse cx="122" cy="123" rx="8" ry="9.5" fill="${p.eye}"/>
<ellipse cx="122" cy="125" rx="4" ry="5" fill="#22183A" opacity="0.55"/><circle cx="118.5" cy="116" r="3.6" fill="#fff"/><circle cx="126" cy="128" r="1.7" fill="#fff"/>
<path d="M66 110 Q78 102 90 110 M110 110 Q122 102 134 110" stroke="#22183A" stroke-width="3.5" fill="none" stroke-linecap="round"/>
<ellipse cx="64" cy="140" rx="7" ry="3.5" fill="#FF9DB0" opacity="0.45"/><ellipse cx="136" cy="140" rx="7" ry="3.5" fill="#FF9DB0" opacity="0.45"/>
<path d="M94 142 Q100 146 106 142" stroke="#6A3A44" stroke-width="2.5" fill="none" stroke-linecap="round"/>
<g opacity="${o(p.glasses)}" fill="none" stroke="${p.trim}" stroke-width="3"><circle cx="78" cy="121" r="16"/><circle cx="122" cy="121" r="16"/><path d="M94 119 Q100 115 106 119"/></g>
<g opacity="${o(p.mask)}"><path d="M46 98 Q100 82 154 98 L152 132 Q126 140 100 126 Q74 140 48 132 Z" fill="#EDE6D6"/>
<path d="M64 114 Q78 106 92 114 M108 114 Q122 106 136 114" stroke="#22183A" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M100 92 V122" stroke="#C9BFA8" stroke-width="2"/></g>
<g opacity="${o(p.horns)}" fill="#2A1430"><path d="M62 56 Q38 34 50 6 Q56 30 78 44 Z"/><path d="M138 56 Q162 34 150 6 Q144 30 122 44 Z"/></g>
<g opacity="${o(p.crown)}"><path d="M72 46 L76 22 L88 34 L100 14 L112 34 L124 22 L128 46 Z" fill="#E8C46A" stroke="#B8913A" stroke-width="2" stroke-linejoin="round"/><circle cx="100" cy="36" r="4.5" fill="#FF7AB6"/></g>
</svg>`;
}

export function golemSvg(size: number, body: string, glow: string, label: string): string {
    return `${svgOpen(size, label)}
<ellipse cx="100" cy="266" rx="58" ry="8" fill="#000" opacity="0.28"/>
<rect x="62" y="214" width="30" height="46" rx="8" fill="${body}"/><rect x="108" y="214" width="30" height="46" rx="8" fill="${body}"/>
<rect x="40" y="128" width="120" height="100" rx="22" fill="${body}"/>
<rect x="40" y="128" width="120" height="100" rx="22" fill="#000" opacity="0.12"/>
<rect x="14" y="140" width="30" height="72" rx="14" fill="${body}"/><rect x="156" y="140" width="30" height="72" rx="14" fill="${body}"/>
<circle cx="100" cy="176" r="24" fill="none" stroke="${glow}" stroke-width="5"/>
<path d="M100 146v10M100 196v10M70 176h10M120 176h10M79 155l7 7M114 190l7 7M121 155l-7 7M86 190l-7 7" stroke="${glow}" stroke-width="4" stroke-linecap="round"/>
<rect x="52" y="40" width="96" height="92" rx="30" fill="${body}"/>
<rect x="66" y="76" width="22" height="14" rx="6" fill="${glow}"/><rect x="112" y="76" width="22" height="14" rx="6" fill="${glow}"/>
<path d="M84 110 h32" stroke="#22183A" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
<path d="M60 60 L48 36 M140 60 L152 36" stroke="${body}" stroke-width="8" stroke-linecap="round"/>
</svg>`;
}

export function stagSvg(size: number): string {
    return `${svgOpen(size, 'The Twin-Path Stag')}
<ellipse cx="100" cy="266" rx="50" ry="7" fill="#000" opacity="0.28"/>
<path d="M78 90 L56 40 L40 30 M56 40 L50 14 M68 64 L44 60" stroke="#8FF3FF" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M122 90 L144 40 L160 30 M144 40 L150 14 M132 64 L156 60" stroke="#8FF3FF" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M70 150 Q60 240 82 260 L118 260 Q140 240 130 150 Z" fill="#7A5236"/>
<ellipse cx="100" cy="128" rx="44" ry="50" fill="#9A6B45"/>
<ellipse cx="100" cy="160" rx="22" ry="20" fill="#F3EBDD"/><ellipse cx="100" cy="152" rx="9" ry="6" fill="#2A2342"/>
<ellipse cx="58" cy="104" rx="16" ry="9" fill="#9A6B45" transform="rotate(-30 58 104)"/><ellipse cx="142" cy="104" rx="16" ry="9" fill="#9A6B45" transform="rotate(30 142 104)"/>
<ellipse cx="82" cy="122" rx="9" ry="11" fill="#22183A"/><ellipse cx="118" cy="122" rx="9" ry="11" fill="#22183A"/>
<circle cx="79" cy="117" r="3.2" fill="#fff"/><circle cx="115" cy="117" r="3.2" fill="#fff"/>
</svg>`;
}

export function sphinxSvg(size: number): string {
    return `${svgOpen(size, 'The Librarian Sphinx')}
<ellipse cx="100" cy="266" rx="62" ry="8" fill="#000" opacity="0.28"/>
<path d="M30 260 Q30 190 100 186 Q170 190 170 260 Z" fill="#C99A45"/>
<path d="M44 70 L100 30 L156 70 L162 170 L38 170 Z" fill="#2B6C86"/>
<path d="M56 74 L100 44 L144 74" stroke="#E8C46A" stroke-width="5" fill="none"/>
<path d="M44 100 h20 M44 120 h20 M44 140 h20 M136 100 h20 M136 120 h20 M136 140 h20" stroke="#E8C46A" stroke-width="5"/>
<ellipse cx="100" cy="118" rx="38" ry="44" fill="#E3B888"/>
<ellipse cx="85" cy="112" rx="7" ry="9" fill="#22183A"/><ellipse cx="115" cy="112" rx="7" ry="9" fill="#22183A"/>
<circle cx="83" cy="108" r="2.6" fill="#fff"/><circle cx="113" cy="108" r="2.6" fill="#fff"/>
<path d="M80 100 Q85 96 92 99 M108 99 Q115 96 120 100" stroke="#2A2342" stroke-width="3" fill="none" stroke-linecap="round"/>
<path d="M92 140 Q100 144 108 140" stroke="#6A3A44" stroke-width="3" fill="none" stroke-linecap="round"/>
<rect x="64" y="196" width="72" height="44" rx="6" fill="#F3EBDD"/><path d="M100 196 V240 M74 210 h18 M74 222 h18 M108 210 h18 M108 222 h18" stroke="#8F86A8" stroke-width="2.5"/>
</svg>`;
}
