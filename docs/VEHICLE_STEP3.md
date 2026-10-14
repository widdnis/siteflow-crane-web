# STEP 3 경로 차량 · 계약과 검증
초기 STEP 3의 루트 두 JSON과 웹 TC1 축약 JSON에는 roads/vehicle_paths가 없었다. 아래 기존 선언 경로 계약은 유지한다. 2026-10-14에는 실제 C090 중심선 주행 미리보기를 별도로 연결했다. 원본 JSON/Exporter/GH 변경 없음.

## 실제 GH 중심선 연결 (2026-10-14)
- 입력: `C:\SiteFlow-GH-Optimization\02_WORKING\GH_RHINO\output\json\viewer_data_20261014_114047_920.json`, Exporter v1.6, schema 2.0.0. 파일을 직접 읽으며 public/fixture에 복사하지 않는다.
- 경로: 파일/URL → parseJsonText → validateJson → normalizeJson → collectVehiclePaths → Viewer 모드·경로 선택 → createVehicleVisual/createVehicleMotion → 공통 requestAnimationFrame.
- 실제 필드: `roads.centerlines[].{id,closed,points:[{x,y,z}],vehicle_enabled}`. 2개 모두 `vehicle_enabled:false`, `source_kind` 없음, `roads.vehicle_paths` 없음. 기존 선언 경로 목록 actualPaths/status/missing은 그대로 유지한다.
- 추가 계산 목록 `routes.centerlinePaths`는 JSON 중심선 형상 미리보기 전용이다. 원본 좌표·플래그·source_kind를 변경하거나 gh로 덧씌우지 않는다. DEMO/알 수 없는 source_kind, 무효 형상, 중복 ID는 이 목록에 넣지 않는다. `surroundings.roads` 352개는 사용하지 않는다.
- ROAD-001: 64점, closed:true, 232.033468462m. 기본 선택. 첫 점 (56.226796443,0,31.547860813), 마지막 점 (56.226796443,0,35.186846533). 원본 closed 선언에 따라 첫 점으로 닫고 한 바퀴 끝에서 정지한다. 원본 점 순서로 전진하며 후진은 그 역순이다.
- ROAD-002: 2점, closed:false, 51.171196604m. 게이트 (146.326541811,0,44.652877530) → (95.155345207,0,44.652877530). 별도 선택 가능하며 양 끝에서 정지한다.
- ROAD-002 종점은 ROAD-001의 16번째 선분(0-based 15) 내부, 매개변수 0.5537670353에 거리 0m로 연결된다. 하지만 분기 후 어느 방향으로 몇 바퀴 돌지 선언되어 있지 않아 합친 경로는 만들지 않는다. 통합 임무 경로가 필요하면 실제 중심선 위의 출발점·분기 방향·순회/종료 순서가 최소 입력이다.
- 모든 Y=0m를 그대로 사용한다. 축·단위 재변환, 지형 높이 보정, 도로 재계산 없음. Exporter 변경·Rhino/GH 실행 불필요.
- 실제 JSON 로딩 후 선언 경로가 없고 유효한 중심선이 있으면 `JSON 현장 중심선 주행 미리보기`가 선택되고 차량 1대는 정지 상태로 준비된다. ROAD-001 기본 선택 → 시작. ROAD-002는 목록에서 선택. 시작/정지/초기화·전진/후진·선분 접선에 따른 차체 회전을 기존 코드로 처리한다.
- 선언 경로/중심선/DEMO는 구분 표시하며 차량은 한 모드·한 경로에만 생성한다. DEMO는 사용자가 켜야 나타난다. 유효한 실제 경로가 없으면 주행 불가·버튼 비활성, DEMO 자동 대체 없음.
- 실제 입력 검증 명령 (PowerShell): `$env:SITEFLOW_VEHICLE_JSON='C:\SiteFlow-GH-Optimization\02_WORKING\GH_RHINO\output\json\viewer_data_20261014_114047_920.json'; node --test tests/vehicle.test.mjs tests/ghVehicle.test.mjs tests/viewerState.test.mjs`.
- ghVehicle 테스트는 실제 파일 로딩·두 선의 연결·모든 선분 위치와 회전·전후진/끝 정지·UI 이벤트/RAF·차량 1대·DEMO 분리·무효 입력·재진입 정지 복원·원문 불변을 확인한다. WebGL renderer/DOM은 기존 테스트 대역을 사용하므로 실제 브라우저 화면 검증을 의미하지 않는다.
- 검증 결과: 위 차량 관련 테스트 18/18 통과(스킵 0), `npm run build` 성공. 번들 500kB 초과 경고만 있으며 본 작업에서 최적화하지 않는다. 원본 SHA-256: `5f0973fc74713dab6cfb1afaaacd687ed8ab75c1362decf6a9bd44583f998cbd`.
- 실제 브라우저/GUI·Rhino/GH 실행, 전체 회귀, PNG/PDF 생성은 수행하지 않았다. commit/push/배포 없음.

## 확장 계약 (schema 2.0.0 호환)
roads는 선택 객체, boundaries[]/widths_m은 기존 설계 유지. 모든 points는 이미 미터·Y-up {x,y,z}.
roads.vehicle_paths[] 항목: {id:string, source_kind:"gh"|"demo", points:[{x,y,z},...], closed?:boolean}.
- id·source_kind·points 필수. 점 2개 이상, 20,000개 이하, 유한 숫자, 비영 구간 필요.
- null/누락은 missing, 빈 배열은 empty, 잘못된 개별 경로는 invalid 경고로 제외. 데이터의 원문은 변경하지 않는다.
- source_kind gh는 입력 데이터의 원천 선언이며 GH 수집·안전 검증 완료를 보증하지 않는다. 실제 샘플에는 해당 경로가 없으므로 최종 GH 포트는 미매핑 상태.
- roads.centerlines[]는 {id,source_kind,points,closed?,vehicle_enabled?}. source_kind gh와 vehicle_enabled:true가 모두 명시된 원본 중심선만 선언 차량 경로 actualPaths로 사용. 그 외 유효한 JSON 중심선은 위의 별도 미리보기 목록으로만 선택하며 도로 영역에서 경로를 추정하지 않는다.
- 루트 vehicle_paths 필드는 사용하지 않으며 경고로 안내. canonical 위치는 roads.vehicle_paths.
- normalizeJson.routes:{status,actualPaths,centerlinePaths,demoPaths,warnings}는 불변 계산 결과이다. snapshot.data는 원문 복제 그대로 유지하고 availability/missing에 roads.vehicle_paths 선언 상태를 추가한다.
- 길이는 3D 구간 Euclidean 거리의 누적값. 곡선 보간 없이 원본 선분 내부를 선형 보간한다. 연속 중복 점의 0길이 구간은 이동 계산에서만 제외. 순수 수직 구간은 지상 차량 미지원.
- closed:true이면 마지막→첫 점을 연결하되 한 바퀴 끝에서 정지, 자동 반복 없음.
- 정규화 전 비유한 숫자·크기 제한 오류는 STEP 1 공통 검증에서 거부된다. 문자열 좌표/단일 점 등 차량 전용 오류는 경로만 제외하며 Viewer 유지.

## DEMO 분리
기본 꺼짐. 사용자가 DEMO 체크박스를 켜야 샘플 트랙이 나타난다.
DEMO 상수는 vehicle.js에만 있고 JSON/정규화 snapshot/현장 객체 목록/model.root에 추가하지 않는다.
별도 Three.js DEMO Vehicle Layer 그룹, 노란 경로·차량, 화면 DEMO 배지·패널 DEMO 안내. JSON 차량 경로와 DEMO 모드는 상호 배타적이며 모드 전환 시 이전 차량 자원 해제.
DEMO 경로는 고정 예시 좌표이며 현장 도로·물류·충돌·운행 안전을 나타내지 않는다.
source_kind:demo 사용자 데이터도 실제 경로 목록에 합치지 않고 DEMO 모드에서만 제공한다.

## 조작·수명
시작/정지/초기화, 전진·후진, 설정 속도 0–10m/s와 실제 현재 속도·거리·상태 표시.
초기화는 출발점·전진·정지 상태. 출발점에서 후진 시작 또는 종점에서 전진 시작 시 즉시 끝 정지. 후진은 차체 전방을 경로 증가 방향에 둔 채 뒤로 이동하며 임의 U턴 없음.
차체는 기본 도형의 위치 기호이며 크기/모델/속도 범위는 장비 사양이 아니다.
차량과 크레인은 같은 requestAnimationFrame을 사용하고 카메라·선택 이벤트는 유지. 주행거리=speed×delta, frame 간격 최대 0.1초 및 visibility 복귀 기준 초기화로 배경 복귀 점프 방지.
홈/Report/새 JSON/Viewer 해제에서 차량 motion.dispose + geometry/material 및 공통 frame/event/renderer 정리. STEP 6A 보완: 같은 스냅샷에서는 DEMO 여부·경로·거리·방향·속도를 별도 UI 체크포인트에서 복원하며 정지 유지. 사용자가 시작하면 이어서 주행. 새 JSON 로딩 성공 시 이전 체크포인트 폐기·DEMO 꺼짐.

## 수동 브라우저 절차 (자동 UI 미검증)
1. npm run dev, http://127.0.0.1:5173/siteflow-crane-web/ 접속 → 최신 JSON 복사본 선택 또는 직접 URL 로딩.
2. 크레인 3/자재 6/오류 4 확인 → Top/Front/Side/Free, Orbit/Pan/Zoom, TC1~TC3 선택·3축·자동회전 및 건물 높이·반경 확인.
3. 차량 panel의 실제 경로 missing·주행 비활성 확인 → DEMO 켜기, 노란 트랙과 눈에 띄는 DEMO 배지 확인.
4. 전진·시작 → 거리 증가·구간 방향 전환 확인. 정지 → 후진·시작 → 거리 감소와 출발점 자동 정지 확인.
5. 초기화·속도 변경·종점 자동 정지 확인. 차량 주행 중 카메라·크레인 조작. 전체화면 안에서도 DEMO 표시/제어 확인.
6. DEMO 끄기 → 차량·트랙 제거. Report/홈 이탈 후 재진입 시 위치·설정 보존·정지, 수동 시작 후 이어서 이동 확인. 새 JSON 성공 시에만 DEMO 꺼짐·초기 상태 확인.
7. 정상/빈/단일 점/문자열 좌표 roads.vehicle_paths 입력 복사본으로 차량 상태 확인 (원본 수정 없이 tests fixture를 메모리에서 확장 가능).
브라우저 연결이 없으면 위 절차는 미검증. 경로 길이·구간 이동·원본 불변·끝 정지·리소스 해제는 npm test로 검사.
