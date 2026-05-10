import { motion, useScroll, useTransform } from "framer-motion";
export default function ParallaxLayers() {
  const { scrollYProgress } = useScroll();
  const backY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const midY = useTransform(scrollYProgress, [0, 1], [0, 220]);
  const frontY = useTransform(scrollYProgress, [0, 1], [0, 340]);
  return (
    <>
      <motion.div style={{ y: backY, position: "absolute", inset: 0, zIndex: -2 }} className="parallax" />
      <motion.div style={{ y: midY, position: "absolute", inset: 0, zIndex: -1 }} className="parallax" />
      <motion.div style={{ y: frontY, position: "absolute", inset: 0, zIndex: 0 }} className="parallax" />
    </>
  );
}
