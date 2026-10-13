# STEP 4 독립 Canvas 2D 배치도
LayoutExporter v3.4.3 원본을 읽기 전용으로 확인. 파일 내부 v3.4.2 상태 문구보다 실제 코드 동작을 우선한다.

## Exporter 실제 동작과 웹 대응
- crane 컴포넌트는 candCircs/zoneCells, layout은 Fitness/MaterialBoxes/SiteElements/ClearanceAreas 시그니처와 확인된 GUID fallback으로 찾는다.
- SiteElements에서 TextDot/TextEntity를 제외하고 도형만 취한다. MaterialBoxes는 기존 실제 Custom Preview를 계속 표시, SiteElements는 읽은 siteMaterial로 별도 conduit에 그린다.
- Rhino의 실제 Visible 객체 + SiteElements + MaterialBoxes가 배치 bounds 원천. 후보 preview·layout·site preview만 임시 숨김, 출력 후 view/preview 상태 복구.
- MaterialBoxes Diffuse가 #3db9ff와 다르면 경고하며 현재 실시간 색을 유지한다. 따라서 JSON에 Preview 색이 없을 때 #3db9ff를 현재 실시간 색이라 주장할 수 없다.
- TC 라벨: candCircs arc center + Rhino XY (1.5m,1.5m), #d23737. 게이트: layout gatePt + 동일 offset, 텍스트 주출입구, #0f7d46.
- 웹은 candCircs 후보 형상/42건을 재현하지 않고 최종 cranes[].position/id/working_radius_m만 사용. label offset는 JSON X/Z의 (1.5m,1.5m) 표시 이동이며 좌표 재변환이 아니다.
- 범례는 실제 Rhino Layer FullPath와 DrawColor 그룹 (leaf 이름, 최대 42자) + MaterialBoxes/SiteElements 실시간 Preview 색. 웹에는 레이어·색 정보 없음 → JSON 유형별 UI 범례로 명시.
- conduit 커브 선 2px, 범례 swatch 선 8px, 라벨 Malgun Gothic. 웹은 검증된 선 폭과 TC/게이트 색을 참조. 기타 도형은 보고서 --ink 대비선으로만 표시하며 GH 원본 색상 재현 아님.
- Capture Top, PNG 2400×1800, axes/grid off. 형상·라벨·오른쪽 범례 bounds 합집합, 여백 각 축 max(4%,1m), 4:3 보정. 웹은 제목·오른쪽 범례·footer를 독립 영역으로 두고 X/Z bounds·반경·라벨에 4%/1m 여백과 단일 scale을 적용.
- 원본의 실험 SVG 출력은 이 단계에 구현하지 않는다.

## 현재 JSON 도형 매핑
| Canvas 도형 | 실제 원천 | 표현·누락 |
|---|---|---|
| 경계·금지구역 | site.boundary / no_go.points | X/Z 원본 폴리곤 외곽, 원본 스타일 missing |
| 게이트 위치/라벨 | site.gate | 위치 기호, 실제 gate 크기 없음; 검증된 Exporter 라벨/색 |
| 건물 3개 | buildings[].footprint | 원본 footprint만 표시, 3D 높이 slider 상태 무시 |
| 자재 6개 | materials[].corners | 8점 X/Z convex hull Top 투영, #3db9ff 검증 기준색 참조; 실시간 Preview 색 missing |
| 최종 크레인 3대/반경 | cranes[].position/id/base/working_radius_m | 원본 값·식별자만; 후보 42건 및 조작 상태 제외 |
| 실제 주행 경로 (있을 경우) | normalized routes.actualPaths | source_kind gh 선언 선만, 도로 경계/폭 의미 아님; DEMO paths 전부 제외 |

+X는 화면 오른쪽, +Z는 화면 위쪽. Canvas 아래쪽 +Y 픽셀 축에 맞춰 Z만 화면 좌표로 투영한다. JSON의 meters/Y-up 값 자체를 변환하지 않는다.
PNG는 같은 snapshot으로 detached canvas를 다시 그리므로 Three.js 화면/카메라/DEMO 상태와 독립이다.
layout.js의 buildLayoutModel/fitLayout/renderLayoutCanvas/createLayoutPng는 이후 Report에서 재사용 가능.
PNG 파일명은 현재 파일명 또는 URL pathname basename의 안전한 stem, query/hash/절대경로 제외. 2400×1800 고정 출력; 화면은 CSS로 같은 비율 유지.
GH 오류 4건과 불일치 경고는 snapshot/UI 원문 유지. PNG에는 원문을 가능한 범위에 그리며 공간 초과 시 생략 안내를 명시.
라벨/범례/제목은 표시 보조 요소; JSON에 없는 추가 현장 객체/구역/도로/자재는 생성하지 않는다.

## layout 확장 계약·최종 GH 수집 TODO
기존 layout.geometry[]:{id,kind,points,closed,color}/labels[]/legend[]/bounds/image_size 설계를 유지한다.
추가 원천 메타데이터 후보: layout.source_geometry (Rhino visible / GH SiteElements / MaterialBoxes), layer_path, draw_color, preview_diffuse, line_width, line_type, label font/anchor.
위 필드는 실제 GH/Rhino 런타임에서 확보할 때만 제공; 필수/선택 및 null/missing 원천을 포트별 명시한다. geometry/labels/legend는 선택; color 등 미제공이면 null/missing, 스타일 추정 금지.
현재 누락: Rhino visible object geometry·Layer names/DrawColor/linetype, GH SiteElements 원형/현재 Custom Preview 색·원본 범례. Report/Canvas 요구 때문에 Exporter·GH·JSON 원본을 수정하지 않는다.
현 단계 layout 확장 객체가 있어도 기본 2.0.0 JSON 투영을 우선 사용하며 해당 원형·스타일 재현은 미지원 안내한다.

## 수동 검증 (브라우저 미연결 시 미검증)
1. npm run dev → http://127.0.0.1:5173/siteflow-crane-web/ → 최신 JSON 파일/직접 URL 로딩 → 2D 배치도 탭.
2. 건물 3/자재 6/TC1~3·반경 40/50/50m, 게이트·금지구역, 오류 4건·누락 안내 확인.
3. 작은 창/큰 창에서 비율·형상·라벨 잘림 확인. PNG 다운로드 버튼 → 파일의 실제 2400×1800, 제목/범례/축척/경고 확인.
4. 3D에서 높이·회전·DEMO 주행 변경 → 2D로 돌아와 원본 현황 그대로·DEMO 미포함 확인.
5. 새 JSON 로딩/Report/홈/재진입 → 새 snapshot 반영 및 이전 다운로드 상태 제거 확인.
자동 테스트는 형상/좌표/fit/개수/불변성 및 mock Canvas toBlob 호출·MIME/실패 처리를 검사한다. 실제 브라우저 Canvas 픽셀·PNG 인코딩/다운로드는 별도 미검증이다.
