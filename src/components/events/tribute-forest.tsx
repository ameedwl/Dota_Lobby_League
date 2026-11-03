import {memo} from "react";

const artPath = "/events/40-minutes-in-the-dark";

function Canopy({mobile = false}: {mobile?: boolean}) {
  return mobile ? <>
    <path className="tribute-bough tribute-bough-left" d="M0 0H92L65 43 51 116 32 162 24 246 0 307V0ZM58 53 129 51 187 28 245 25 303 0H275L235 17 181 18 123 36 69 33ZM129 45 168 74 203 83 232 109 208 78 174 66 151 42Z"/>
    <path className="tribute-bough tribute-bough-right" d="M900 0H799L828 47 854 70 875 131 900 217V0ZM853 75 777 61 725 28 670 20 714 37 765 76 824 91 877 120ZM777 64 741 97 687 112 745 105 796 77Z"/>
  </> : <>
    <path className="tribute-bough tribute-bough-left" d="M0 0H103L78 30 60 79 37 126 25 207 0 285V0ZM62 63 139 67 201 45 252 44 328 14 397 0H340L248 30 196 30 135 51 70 45ZM198 40 222 69 259 81 297 115 268 80 232 61 216 35ZM256 75 270 63 304 59 273 57 247 70Z"/>
    <path className="tribute-bough tribute-bough-right" d="M1672 0H1562L1590 34 1610 77 1641 112 1654 185 1672 256V0ZM1621 91 1547 69 1488 38 1431 32 1373 0H1331L1420 43 1478 53 1538 85 1633 115ZM1519 68 1473 93 1439 96 1397 119 1442 103 1479 103 1540 76Z"/>
  </>;
}

function Fractures({mobile = false}: {mobile?: boolean}) {
  return mobile ? <>
    <path className="tribute-glint tribute-glint-night" d="m289 257 9 5 6-1m9 1 7-5"/>
    <path className="tribute-glint tribute-glint-spirit" d="m788 1317-10 9-17 4-9 13-18 5"/>
  </> : <>
    <path className="tribute-glint tribute-glint-spirit" d="m323 648 14 5 7 13 15 5 12 10"/>
    <path className="tribute-glint tribute-glint-medusa" d="m1397 347 12-7 12 1m14-5 9-7"/>
    <path className="tribute-glint tribute-glint-fiend" d="m1378 623 7 12-5 11 9 11-4 10m-68 27 4 13 11 7"/>
    <path className="tribute-glint tribute-glint-wing" d="m203 274 8-14 11-9m9-8 5-7"/>
    <path className="tribute-glint tribute-glint-night" d="m400 362 7 4 4-1m6 0 5-4"/>
  </>;
}

const batShape = "M0 1C-3-3-7-6-14-6l3 4 1 4 4-1 4 3L0 5l2-1 4-3 4 1 1-4 3-4C7-6 3-3 0 1Z";

function Bats() {
  return <div className="tribute-bats">
    {[0, 1, 2].map(bat => <svg key={bat} className="tribute-bat" viewBox="-15 -8 30 16" focusable="false"><path d={batShape}/></svg>)}
  </div>;
}

export const TributeForest = memo(function TributeForest({scene}: {scene: "intro" | "archive" | "global"}) {
  return <div className="tribute-forest" data-scene={scene} aria-hidden="true">
    <picture className="tribute-forest-plate">
      <source media="(max-aspect-ratio: 4/5)" srcSet={`${artPath}/ruined-forest-portrait.webp`}/>
      {/* Picture selects one art direction without fetching both. */}
      <img src={`${artPath}/ruined-forest.webp`} width="1672" height="941" alt=""/>
    </picture>
    <div className="tribute-fog tribute-fog-back"/>
    <div className="tribute-forest-shadow"/>
    <svg className="tribute-canopy tribute-wide" viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice" focusable="false">
      <Fractures/><Canopy/>
    </svg>
    <svg className="tribute-canopy tribute-portrait" viewBox="0 0 900 1600" preserveAspectRatio="xMidYMid slice" focusable="false">
      <Fractures mobile/><Canopy mobile/>
    </svg>
    <div className="tribute-fog tribute-fog-mid"/>
    <div className="tribute-fog tribute-fog-front"/>
    <Bats/>
    <div className="tribute-forest-veil"/>
  </div>;
});
