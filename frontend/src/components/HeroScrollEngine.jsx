import { useEffect } from "react";
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
import SvgScene from "./SvgScene";
import "../styles/scroll.css";

gsap.registerPlugin(ScrollTrigger);

export default function HeroScrollEngine() {

  useEffect(() => {
    // Awwwards-level Speed factor for high-resolution feel
    const speed = 150; 

    // Hills Parallax Timeline
    const hillsTl = gsap.timeline();

    ScrollTrigger.create({
      animation: hillsTl,
      trigger: ".scrollElement",
      start: "top top",
      end: "bottom 30%",
      scrub: 3, // Liquid-smooth lag
    });

    // Animate hills with different depths
    hillsTl.to("#h1-1", { 
      y: 4 * speed, 
      x: 1.5 * speed, 
      ease: "power2.inOut" 
    }, 0);
    
    hillsTl.to("#h1-2", { 
      y: 3.5 * speed, 
      x: -1.2 * speed, 
      ease: "power2.inOut" 
    }, 0);

    // Clouds Float Timeline
    const cloudsTl = gsap.timeline();

    ScrollTrigger.create({
      animation: cloudsTl,
      trigger: ".scrollElement",
      start: "top top",
      end: "bottom top",
      scrub: 1.5,
    });

    cloudsTl.to("#cloud1", { x: 600, y: -50, scale: 1.2, opacity: 0.6 }, 0);
    cloudsTl.to("#cloud2", { x: 1100, y: 30, scale: 0.8, opacity: 0.4 }, 0);
    cloudsTl.to("#cloud3", { x: -900, y: -20, scale: 1.1, opacity: 0.5 }, 0);
    cloudsTl.to("#cloud4", { x: 1300, y: 60, scale: 0.9, opacity: 0.3 }, 0);

    // Cinematic Text Exit
    gsap.to("#info", {
      opacity: 0,
      y: -speed * 2,
      blur: 10,
      scale: 1.5,
      scrollTrigger: {
        trigger: ".scrollElement",
        start: "top top",
        end: "25% top",
        scrub: true,
      }
    });

    // Cleanup
    return () => {
      ScrollTrigger.getAll().forEach(st => st.kill());
    };

  }, []);

  return (
    <div className="wrapper">
      <SvgScene />
      <div className="scrollElement"></div>
    </div>
  );
}
