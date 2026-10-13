# SiteFlow 통합 JSON 계약 — STEP 1
기존 schema.version = 2.0.0을 유지한다. UTF-8 JSON, 20 MB 이하, 깊이 48 / 노드 500,000 / 배열 20,000 이하.
units.output = meters, coordinates.target = Unity Y-up 필수. Rhino mm→m, (X,Y,Z)→(X,Z,Y)는 Exporter에서 이미 수행했으므로 웹은 변환하지 않는다. 방향각은 Rhino 기준 그대로 보존하고 기존 TC1 미리보기만 이를 사용한다.

| 필드 | 원천 역할/포트 | 필수 여부·단위·null |
|---|---|---|
| schema, units, coordinates | JsonExporter v1.2 계약 | 버전·단위·좌표 필수 |
| cranes[] | crane 역할: cranePts / assignedCraneTypes / craneBases / craneCircs + selModel / selRank; shape 역할: info | 배열 필수, 빈 선정 허용. 최종 선정만 렌더링; position 미터, height_m/radius 양수 또는 null. 미제공 형상은 표시 안 함 |
| site | crane 입력 site / gate / nogo | 선택 (TC1 축약본 호환). boundary/no_go 닫힌 XZ 폴리곤, gate 좌표; null=missing |
| buildings[] | crane 입력 bldg / bldgH / bldgName | 선택, footprint·current_height_m 미터; max_height_m null 유지 |
| materials[] | layout 출력 MaterialBoxes / ClearanceAreas + 입력 currentDay/startDays/endDays/matWeights/maxHeights; schedule 출력 matName | 선택, 실제 박스만 유지. center/corners 미터, weight_t 톤, 누락 자재 생성 금지 |
| crane_catalog[] | crane 입력 catalog (C019 공급) | 선택, 원본 렌트 값·단위 추정 금지; catalog_spec 우선 |
| schedule | layout 입력 currentDay; height_rule | 선택, 일수·null 보존. active_material_count는 향후 검증된 활성 start/end 개수만 허용 (정수) |
| metadata | layout Fitness/Errors; crane 후보 점수·설명·final_selection | 선택, 후보는 감사 정보. 오류/경고/missing 원문 유지 |
| roads | 향후 경계 원본 커브 + roadWidth/branchWidth, 중심선/경로 별도 검증 | 선택 객체: boundaries[] 폴리곤, widths_m:{main,branch}, centerlines[]:{id,points[]}, vehicle_paths[]:{id,points[],closed,source_kind}. 미터/Y-up. 확인 전 missing, 경로 추정 금지 |
| layout | LayoutExporter **v3.4.3**의 SiteElements/MaterialBoxes, Rhino 표시 객체·Custom Preview 색, TC/게이트 라벨/범례 | 선택 객체: geometry[]:{id,kind,points[],closed,color}, labels[]:{text,position}, legend[]:{label,color}, bounds:{min,max}, image_size:{width,height}. 실제 원천 확인 전 missing |
| report | ReportExporter v2.4 inputs/candidates/layout/drawing/appendix | 선택 객체: inputs:{roadWidth,branchWidth,clearance}, candidates:{info,scores,loadDist,loadLimit}, layout_results:{fitness,errors,summary}, detail. 단위는 port별 명시; 없는 값 null/missing |

필수 식별자 id 중복은 거부한다. 제공된 좌표·배열·형상·유한 숫자는 검증한다. 알려지지 않은 필드는 보존하되 렌더러에서 사용하지 않는다. 확장 roads/layout/report는 STEP 1에서 객체 형태·크기·유한 숫자만 검사하며, 전용 렌더러 도입 시 상세 계약 검증을 추가한다.
폴리곤은 닫힘·서로 다른 3점·XZ 면적 검사까지 수행; 교차 및 위상 검증은 후속 형상 단계에서 추가한다.

normalizeJson 결과는 {data, source, availability, missing, summary} 전체를 깊게 freeze한다. 원본은 복제하고 변경하지 않는다. missing은 별도 상태이며 빈 배열/0을 결측 값으로 만들어 넣지 않는다.
UI 상태는 state.js의 screen/tab/loading/requestId에만 저장. 크레인 회전 등은 기존 Viewer 인스턴스에만 저장하며 스냅샷을 변경하지 않는다.
파일/URL 모두 parseJsonText→validateJson→normalizeJson로 통합. 취소·실패 시 이전 스냅샷 유지, 새 성공 시 교체. 홈 복귀 시 스냅샷 유지하고 Viewer 및 자동회전 자원을 해제한다. 느린 이전 요청은 requestId로 배제한다.
HTTP(S) 직접 JSON/CORS만 지원, 인증 credentials 생략, 20초 시간 제한. 공유/Supabase/최종 GH 연결은 미구현.

최신 viewer_data_20261012_142857_140.json: 최종 3대 / 실제 박스 6 / 오류 4 / 후보 42.
**활성 8은 JSON에 없고 EXPORT_CHECK_20261012_142857_140.md에만 기록된다.** 활성 수는 null + missing으로 보존하며 6/8 불일치 경고 원문을 유지한다. 체크 문서의 숫자를 모든 사용자 JSON에 하드코딩하지 않는다.


## STEP 3 차량 경로 확정
상세 계약/수동 절차: VEHICLE_STEP3.md. roads.vehicle_paths[]는 {id,source_kind:gh|demo,points[],closed?}.
source_kind=gh 입력 선언의 명시 경로만 실제 JSON 경로로 사용, GH 연결 성공을 의미하지 않음.
roads.centerlines[]는 source_kind=gh 및 vehicle_enabled:true인 경우만 차량 경로로 선택 가능.
차량 경로 전용 validation은 normalizeJson.routes의 status/actualPaths/demoPaths/warnings에 반영. 도로가 없어도 원문에 빈 roads를 생성하지 않음.
DEMO 상수는 Viewer 모듈에만 존재하고 입력 JSON·공유 스냅샷·현장 객체 목록과 분리. 기본 꺼짐.
빈/단일 점/문자열 좌표 경로는 제외·경고; 공통 깊이/크기/비유한 숫자 오류는 기존 전체 입력 검증에서 거부.
미터·Y-up 유지, 선분 거리 기반 이동, 구간 끝 정지. 도로 면으로부터 중심선을 추정하거나 fixture를 실제 GH 데이터로 간주하지 않음.

## STEP 4 layout 상태
독립 Canvas 기본 2.0.0 투영과 2400×1800 PNG 제공. SiteElements/Rhino 레이어·실시간 색·linetype 원형은 missing. 확장 source_geometry/layer_path/draw_color/preview_diffuse/line_width/line_type/label font 원천 필드는 실제 수집 후에만 제공. 자세한 매핑: LAYOUT_STEP4.md. 현재 layout 확장 원형은 기본 투영에 합치지 않고 미지원으로 안내.

## STEP 5 보고서 계약
report 입력/하중/SummaryReport가 없는 현재 JSON은 missing 유지. 기존 metadata 후보·Fitness·Errors와 최종 cranes/materials를 별도 섹션으로 표시. 활성 8은 EXPORT_CHECK 개발 참고 기록일 뿐 JSON 필드로 합치지 않음. Report/PNG는 동일 불변 snapshot. 상세 매핑·인쇄·수동 절차: REPORT_STEP5.md.
