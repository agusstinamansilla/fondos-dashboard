import dynamic from 'next/dynamic';

const FondosDashboard = dynamic(() => import('../components/FondosDashboard'), { ssr: false });

export default function Home() {
  return <FondosDashboard />;
}
