import { BUILD_INFO } from "@/lib/build-info.generated"

const REPO_URL = "https://github.com/batas/plantastic"

export default function Footer() {
  const builtAt = new Date(BUILD_INFO.builtAt).toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
  })
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto max-w-5xl px-4 py-4 text-xs text-zinc-400 dark:text-zinc-500">
        v{BUILD_INFO.version}
        {BUILD_INFO.commit && (
          <>
            {" · "}
            <a
              href={`${REPO_URL}/commit/${BUILD_INFO.commit}`}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {BUILD_INFO.commit}
            </a>
          </>
        )}
        {BUILD_INFO.branch && <> · {BUILD_INFO.branch}</>}
        <> · zbudowano {builtAt}</>
      </div>
    </footer>
  )
}
