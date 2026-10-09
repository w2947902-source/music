import Link from "next/link";
import { Disc3 } from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="SLEEVE 唱片馆首页">
      <Disc3 size={26} strokeWidth={1.3} />
      <span>
        SLEEVE<span className="brand-period">.</span>
      </span>
    </Link>
  );
}
