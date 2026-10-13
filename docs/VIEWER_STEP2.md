# STEP 2 현장 Viewer
입력은 normalizeJson의 불변 스냅샷 하나. 장면·선택·높이·애니메이션 상태는 별도의 Three.js 객체에만 저장한다.
siteScene.js는 스냅샷을 장면으로 구성하고 Node에서 형상/제어/회귀 검증 가능. viewer.js는 DOM·WebGL·OrbitControls·이벤트 수명만 담당한다.

- 경계/금지구역: 원본 (x,y,z) 선, 평면 XZ 채움. 게이트는 실제 점 위치의 기호이며 표시 크기 1m는 형상 사양이 아님.
- 건물: XZ footprint로 삼각분할·수직 extrusion, 바닥 원본 Y 유지. 비평면 footprint는 생략·경고.
- 자재: 원본 8개 corners의 12 삼각형 표면, 좌표/크기를 그대로 표시. 누락 박스 생성 없음.
- 크레인: cranes[] 최종 결과만 createCrane 재사용; TC1/TC2/TC3 위치·반경·height_m 유지. 후보 42는 metadata 감사 정보.
- 반경: 실제 working_radius_m의 XZ 원. 선 가시성 제어 가능.
- 카메라: Orbit/Pan/Zoom, Top 직교 + Front/Side/Free 원근; bounds/FOV/aspect 기준 fit.
- 선택: canvas 클릭과 목록 선택, 클릭 임계 거리 5px로 Orbit drag와 구분. 사용자 입력 데이터를 textContent로 표시. 색 강조는 장면 material만 변경.
- 건물 높이: 0–current_height_m 시각화, 바닥 유지. schedule 기반 높이·미래 높이 생성 없음.
- 크레인 3축: 기존 절차적 피벗과 계층을 사용한 절대 Y축 0–360 회전, 트롤리 local Z 0–working_radius_m, cable 및 hook Y 조절. 시작 각 400°는 동등한 40°로 표시. 자동회전 12°/초; 선택 해제 시 해당 크레인 자동회전 중지.
- 후크 높이는 절차적 Hook 그룹 원점의 world Y. 범위는 Unity 참고용 와이어 시각화 제한, 실제 장비 허용치가 아님.
- 전체화면: API 실패 메시지·fullscreenchange/ResizeObserver 대응.
- 홈·탭·새 JSON: frame/event/observer/OrbitControls/geometry/material/renderer 정리, renderer context 해제. STEP 6A 보완: 같은 스냅샷 재진입 시 별도 UI 체크포인트에서 크레인 3축·선택·카메라·건물 높이·반경 표시를 복원하되 차량과 자동회전은 정지. 새 JSON 성공 시 원본 초기 상태로 복원.
- GH 오류·불일치 원문은 상단 details에서 유지, Viewer 상태 영역에 건수 표시.
- roads/vehicle path/모델 에셋/검증 피벗 미제공. 절차적 크레인은 장비 운영·충돌·하중 검증을 의미하지 않음.
- 실제 Rhino 회전각과 장비 방향 대응은 미검증. 자기 교차 폴리곤 위상 검증·보고서·차량·2D·PDF는 후속 단계.
