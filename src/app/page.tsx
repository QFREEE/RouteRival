import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>RouteRival</h1>
        <p>Competitive multimodal routing game. Build your route first, see total time only after submit.</p>
        <Link href="/challenge/today" className={styles.cta}>
          Play Today&apos;s Challenge
        </Link>
      </section>
    </main>
  );
}
