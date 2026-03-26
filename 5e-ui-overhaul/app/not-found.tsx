import Link from "next/link";

export default function NotFound() {
  return (
    <div className="not-found-view">
      <div className="not-found-card">
        <p className="hero-card__eyebrow">404</p>
        <h1>这一页没有被编入当前静态典籍。</h1>
        <p>
          可能是目录外的旧链接，也可能是导入时未生成的路径。返回首页或重新从目录进入。
        </p>
        <div className="reader-actions">
          <Link href="/" className="shell-button shell-button--primary">
            回到首页
          </Link>
        </div>
      </div>
    </div>
  );
}
