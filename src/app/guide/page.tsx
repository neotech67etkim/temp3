import { BackToDashboard } from "@/components/back-to-dashboard";

const TOC = [
  { href: "#login", label: "1. 최초 로그인 및 비밀번호 변경" },
  { href: "#workflow", label: "2. Work Order 흐름 체계" },
  { href: "#usage", label: "3. 화면별 이용 방법" },
  { href: "#roles", label: "4. 역할별 이용 방법" },
  { href: "#caution", label: "5. 주의사항" },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 rounded-lg border border-slate-200 bg-white p-6"
    >
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
        {n}
      </span>
      <p className="pt-0.5">{children}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      {children}
    </div>
  );
}

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackToDashboard />
      <h1 className="text-xl font-semibold text-slate-900">이용 안내서</h1>
      <p className="mt-1 text-sm text-slate-500">
        Work Order 관리 시스템을 처음 사용하시는 분들을 위한 안내입니다. 목차를
        눌러 원하는 항목으로 바로 이동할 수 있습니다.
      </p>

      <nav className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <ul className="flex flex-col gap-1">
          {TOC.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="block rounded px-2 py-1 text-sm text-blue-700 hover:bg-blue-50"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6 flex flex-col gap-6">
        <Section id="login" title="1. 최초 로그인 및 비밀번호 변경">
          <p>
            계정은 관리자가 조직 관리 화면에서 미리 생성해 둡니다. 본인의
            로그인 이메일과 초기 비밀번호는 관리자(부서장 또는 시스템 관리자)에게
            안내받으세요.
          </p>
          <div className="flex flex-col gap-2">
            <Step n={1}>
              로그인 화면에서 안내받은 <strong>이메일</strong>과{" "}
              <strong>초기 비밀번호</strong>를 입력해 로그인합니다.
            </Step>
            <Step n={2}>
              로그인 후 상단 메뉴의 <strong>내 계정</strong>으로 이동합니다.
            </Step>
            <Step n={3}>
              현재 비밀번호(초기 비밀번호)를 입력해 본인 확인 후, 새 비밀번호를
              입력하고 저장합니다.
            </Step>
            <Step n={4}>
              로그인 이메일(아이디)은 정책상 본인도 변경할 수 없습니다. 변경이
              필요하면 관리자에게 문의하세요.
            </Step>
          </div>
          <Note>
            비밀번호는 8자 이상으로 설정하고, 본인만 알 수 있도록 관리하세요.
          </Note>
        </Section>

        <Section id="workflow" title="2. Work Order 흐름 체계">
          <p>
            조직은 <strong>부서 → 과 → 팀</strong> 순서로 구성됩니다. 과에는
            사무직인 <strong>과원</strong>이 소속되고, 그 아래 현장 작업팀은
            <strong> 팀장</strong>만 개별 계정으로 등록됩니다.
          </p>
          <p>
            업무는 <strong>프로젝트</strong> 아래에서 <strong>Work
            Order(업무지시)</strong> 형태로 만들어지며, 상위 조직에서 하위
            조직/개인으로 업무를 쪼개어 내려보내는 방식으로 흐릅니다.
          </p>
          <div className="flex flex-col gap-2">
            <Step n={1}>
              <strong>부서장</strong>이 프로젝트 아래 업무를 만들어{" "}
              <strong>과장</strong> 또는 <strong>과원</strong>에게 할당합니다.
            </Step>
            <Step n={2}>
              업무를 받은 <strong>과장</strong>은 필요하면 그 아래 하위 업무를
              만들어 <strong>본인 과 소속 과원</strong>에게 다시 나누어
              할당합니다.
            </Step>
            <Step n={3}>
              업무를 최종적으로 받은 사람은 진행 상황을 상태·진행률로
              업데이트하고, 진행관련 정보 및 질문(텍스트/스크린샷/참고 파일
              경로)을 남깁니다.
            </Step>
            <Step n={4}>
              상위 업무의 진행률은 하위 업무들의 평균으로 자동 계산되어,
              부서/과 단위로도 전체 진행 상황을 한눈에 볼 수 있습니다.
            </Step>
          </div>
          <p>
            부서/과 단위로 할당된 업무를 특정 직원에게 맡기고 싶다면, 하위
            업무를 새로 만들지 않고 <strong>담당자 개인 지정</strong> 기능으로
            그 업무 자체를 바로 넘길 수 있습니다. 개인에게 이미 할당된 업무도
            같은 방식으로 다른 사람에게 <strong>이관(담당자 변경)</strong>할
            수 있고, 이렇게 지정/이관된 업무는 목록에
            <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
              이관됨
            </span>{" "}
            배지로 표시됩니다.
          </p>
        </Section>

        <Section id="usage" title="3. 화면별 이용 방법">
          <p>
            <strong>대시보드</strong> — 로그인 후 첫 화면입니다. 맨 위에{" "}
            <strong>내 업무리스트</strong>(빠른 할일 추가 포함)와{" "}
            <strong>과별 진행현황</strong>이 바로 보이고, 그 아래에는 회사
            전체의 업무영역별 진행률·상태 분포·조직 전체 진행 현황이 이어집니다.
            업무리스트에는 나에게 지시된 업무와 직접 만든 할일이 함께
            나타나며, 각 항목에 지시자(본인이 지시자인 경우 본인 이름 그대로
            표시), 담당자, 이관 여부가 표시됩니다. 필요하면
            &quot;+ 하위 업무로 위임&quot;으로 부서/과원에게 나누어 줄 수
            있습니다. 상태·우선순위·진행률을 바꾸려면 업무를 클릭해 상세
            화면에서 변경합니다.
          </p>
          <p>
            <strong>프로젝트</strong> — 프로젝트별로 Work Order 트리(상위-하위
            구조)를 확인하고, 업무를 새로 할당하거나 하위 업무를 추가합니다.
          </p>
          <p>
            <strong>Work Order</strong> — 내 권한 범위에 있는 전체 업무
            목록입니다. &quot;지시자 → 담당&quot; 형태로 누가 지시했고 누가
            맡았는지 확인할 수 있고, 마감일이 지났는데 미완료인 업무는{" "}
            <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">
              지연
            </span>{" "}
            배지가 붙습니다.
          </p>
          <p>
            <strong>Work Order 상세</strong> — 업무를 클릭하면 상세 화면으로
            이동합니다. 여기서 상태·우선순위·진행률을 바꾸고, 업무내용 및
            참고사항을 수정하고, 진행관련 정보 및 질문을 기록합니다. 하위 업무가 있는
            업무는 진행률을 직접 입력할 수 없고 하위 업무 평균으로 자동
            계산됩니다. 부서/과 단위로 할당된 업무는 &quot;담당자 개인
            지정&quot;으로, 개인에게 할당된 업무는 &quot;담당자 변경(이관)&quot;
            으로 내 권한 범위 안의 다른 사람에게 바로 넘길 수 있습니다(하위
            업무를 새로 만들 필요 없음).
          </p>
          <p>
            <strong>진행관련 정보 및 질문 기록</strong> — 상세 화면 하단에서
            텍스트로 남기고, 스크린샷은 입력창에 <strong>Ctrl+V로 붙여넣기</strong>하거나
            파일을 끌어다 놓으면 첨부되며, 참고 파일이 사내 공유 폴더에 있다면
            그 경로를 텍스트로 남겨도 됩니다.
          </p>
          <p>
            <strong>간트차트</strong> — 업무별 일정과 지연 여부를 막대그래프로
            확인합니다. 부서장·과장은 부서 또는 과를 선택해 전체를 볼 수
            있고, 과원·팀장은 본인이 소속된 과의 내용만 볼 수 있습니다.
          </p>
          <p>
            <strong>조직 관리</strong>(관리자 전용) — 부서/과/팀/사용자를
            추가·삭제하고 조직도를 관리합니다.
          </p>
          <p>
            어느 화면에서든 좌측 상단의 뒤로가기 버튼(&quot;← 대시보드로&quot;
            또는 &quot;← 이전 페이지로&quot;)으로 바로 이전 화면으로 돌아갈 수
            있습니다.
          </p>
        </Section>

        <Section id="roles" title="4. 역할별 이용 방법">
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-medium text-slate-800">부서장</p>
              <ul className="mt-1 list-disc pl-5">
                <li>
                  대시보드·간트차트로 부서 전체(전 과) 진행 상황을
                  모니터링합니다.
                </li>
                <li>
                  업무를 새로 할당할 때 <strong>같은 부서 소속 과장 또는
                  과원</strong>에게만 할당할 수 있습니다(다른 부서 인원은 대상에
                  나타나지 않습니다).
                </li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-slate-800">과장</p>
              <ul className="mt-1 list-disc pl-5">
                <li>
                  업무를 할당할 때 <strong>본인이 담당하는 과의 과원</strong>
                  에게만 할당할 수 있습니다.
                </li>
                <li>
                  대시보드의 &quot;내 업무리스트&quot;에는 <strong>과 단위로
                  지시받은 업무</strong>와 <strong>본인 개인 업무</strong>가
                  함께 표시되어, 과 전체 업무와 개인 업무를 한 화면에서 확인할
                  수 있습니다.
                </li>
                <li>간트차트도 부서장과 동일하게 전체 과를 볼 수 있습니다.</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-slate-800">과원</p>
              <ul className="mt-1 list-disc pl-5">
                <li>다른 사람에게 업무를 할당하거나 이관할 수 없습니다.</li>
                <li>
                  대시보드의 &quot;내 업무리스트&quot;에서 본인에게 할당된
                  업무와 직접 만든 할일을 확인하고, 업무를 클릭해
                  상태·진행률을 갱신하거나 진행관련 정보 및 질문을 남깁니다.
                </li>
                <li>간트차트는 본인이 소속된 과의 내용만 볼 수 있습니다.</li>
              </ul>
            </div>
          </div>
        </Section>

        <Section id="caution" title="5. 주의사항">
          <ul className="list-disc pl-5">
            <li>로그인 이메일/비밀번호는 본인만 사용하고 타인과 공유하지 마세요.</li>
            <li>
              진행률을 100%로 입력하면 자동으로 <strong>완료</strong> 처리되고
              완료 시각이 기록됩니다. 실제로 끝난 업무에만 입력하세요.
            </li>
            <li>
              하위 업무가 있는 업무는 진행률이 하위 업무 평균으로 자동
              계산되므로 직접 입력할 수 없습니다.
            </li>
            <li>업무 이관 시 이전/이후 담당자와 이관한 사람이 진행관련 정보 및 질문에 자동으로 기록됩니다.</li>
            <li>
              업무·조직·계정 삭제는 되돌릴 수 없습니다. 삭제 전에 다시 한 번
              확인하세요.
            </li>
            <li>
              업무를 생성한 사람의 계정은 관련 업무가 남아있는 동안 삭제되지
              않습니다.
            </li>
            <li>
              첨부한 스크린샷과 모든 업무 데이터는 사내 서버에만 저장되며
              외부로 나가지 않습니다.
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
