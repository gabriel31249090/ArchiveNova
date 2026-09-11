export default function AuthErrorPage() {
  return (
    <main style={{ maxWidth: 720, margin: '80px auto', padding: 24 }}>
      <p className="eyebrow">Archive Nova</p>
      <h1>Não foi possível confirmar sua conta.</h1>
      <p>O link pode ter expirado ou já ter sido utilizado. Volte para a página inicial e tente entrar novamente.</p>
      <a className="primary-button" href="/">Voltar ao Archive Nova</a>
    </main>
  )
}
