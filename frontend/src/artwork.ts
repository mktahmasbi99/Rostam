import background768Jpeg from "./generated/artwork/background-768.jpg";
import background768Webp from "./generated/artwork/background-768.webp";
import background1214Jpeg from "./generated/artwork/background-1214.jpg";
import background1214Webp from "./generated/artwork/background-1214.webp";
import logo112Png from "./generated/artwork/logo-112.png";
import logo112Webp from "./generated/artwork/logo-112.webp";
import logo224Png from "./generated/artwork/logo-224.png";
import logo224Webp from "./generated/artwork/logo-224.webp";
import logo336Png from "./generated/artwork/logo-336.png";
import logo336Webp from "./generated/artwork/logo-336.webp";

export const artwork = {
  background768: { webp: background768Webp, jpeg: background768Jpeg },
  background1214: { webp: background1214Webp, jpeg: background1214Jpeg },
  logo: {
    src: logo336Png,
    webp: `${logo112Webp} 112w, ${logo224Webp} 224w, ${logo336Webp} 336w`,
    png: `${logo112Png} 112w, ${logo224Png} 224w, ${logo336Png} 336w`,
  },
};
