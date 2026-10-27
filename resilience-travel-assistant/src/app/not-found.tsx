import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card">
      <h1 className="text-lg font-semibold text-slate-900">找不到這個頁面</h1>
      <p className="mt-1 text-sm text-slate-600">
        首版只有兩個頁面：行程輸入頁與結果頁。請回到輸入頁重新開始。
      </p>
      <Link className="btn-secondary mt-3 inline-flex items-center" href="/">
        返回輸入頁
      </Link>
    </div>
  );
}
