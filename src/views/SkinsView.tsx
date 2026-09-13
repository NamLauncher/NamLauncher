// Author/creator: nattapat2871 (https://nattapat2871.me)

export function SkinsView({ model }: { model: any }) {
  const {
    Loader2,
    SkinPage,
    Suspense,
    accounts,
    activeAccountId,
    language,
    motion,
    pageMotionProps,
    setAccountSkinTextures,
    setLoginStep,
    setShowLoginModal,
    setStatusText,
    t
  } = model

  return (
              <motion.div key="skins" {...pageMotionProps}>
                <Suspense fallback={
                  <section className="flex min-h-[520px] items-center justify-center rounded-lg border border-slate-800 bg-[#0d1526]">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-500">
                      <Loader2 size={17} className="animate-spin text-blue-300" />
                      {t('skin.loading')}
                    </div>
                  </section>
                }>
                  <SkinPage
                    accounts={accounts}
                    activeAccountId={activeAccountId}
                    language={language}
                    onRequestLogin={() => {
                      setLoginStep('select')
                      setShowLoginModal(true)
                    }}
                    onStatus={setStatusText}
                    onLibraryChange={(library: any) => {
                      const texture = library.effectiveSkin?.textureDataUrl || ''
                      if (!texture) return
                      setAccountSkinTextures((current: Record<string, string>) => (
                        current[library.accountId] === texture
                          ? current
                          : { ...current, [library.accountId]: texture }
                      ))
                    }}
                  />
                </Suspense>
              </motion.div>
            )
}
