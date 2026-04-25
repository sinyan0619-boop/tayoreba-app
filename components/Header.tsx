import Link from 'next/link';

interface Props {
  title: string;
  backHref?: string;
  right?: React.ReactNode;
}

export default function Header({ title, backHref, right }: Props) {
  return (
    <header
      className="flex items-center h-14 px-4 shrink-0"
      style={{ backgroundColor: '#1a1a2e' }}
    >
      {backHref && (
        <Link
          href={backHref}
          className="mr-3 text-white text-2xl leading-none font-light"
        >
          ‹
        </Link>
      )}
      <h1 className="text-white font-bold text-lg flex-1 truncate">{title}</h1>
      {right && <div className="ml-2">{right}</div>}
    </header>
  );
}
