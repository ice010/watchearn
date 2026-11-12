// Free-to-stream content: Blender open movies (CC-BY), public-domain films from the
// Internet Archive, and CC0 clips. Replace/extend with your own licensed content.
const IA = (id) => `https://archive.org/services/img/${id}`;
const PEACH = 'https://peach.blender.org/wp-content/uploads/title_anouncement.jpg';
const DURIAN = 'https://durian.blender.org/wp-content/uploads/2010/06/05.8b_comp_000272.jpg';
const MANGO = 'https://mango.blender.org/wp-content/uploads/2013/05/01_thom_celia_bridge.jpg';

const catalog = [
  { id: 'bbb', type: 'movie', title: 'Big Buck Bunny', duration: 596, url: 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4', thumbnail: IA('BigBuckBunny_124') },
  { id: 'ed', type: 'movie', title: 'Elephants Dream', duration: 653, url: 'https://archive.org/download/ElephantsDream/ed_hd.mp4', thumbnail: IA('ElephantsDream') },
  { id: 'sintel', type: 'movie', title: 'Sintel', duration: 888, url: 'https://archive.org/download/Sintel/sintel-2048-surround.mp4', thumbnail: IA('Sintel') },
  { id: 'tos', type: 'movie', title: 'Tears of Steel', duration: 734, url: 'https://archive.org/download/Tears-of-Steel/tears_of_steel_1080p.mp4', thumbnail: MANGO },
  { id: 'girl-friday', type: 'movie', title: 'His Girl Friday (1940)', duration: 5520, url: 'https://archive.org/download/his_girl_friday/his_girl_friday_512kb.mp4', thumbnail: IA('his_girl_friday') },
  { id: 'the-count', type: 'movie', title: 'Charlie Chaplin – The Count (1916)', duration: 1560, url: 'https://archive.org/download/CC_1916_09_04_TheCount/CC_1916_09_04_TheCount_512kb.mp4', thumbnail: IA('CC_1916_09_04_TheCount') },

  { id: 'sintel-trailer', type: 'trailer', title: 'Sintel – Official Trailer', duration: 52, url: 'https://download.blender.org/durian/trailer/sintel_trailer-720p.mp4', thumbnail: DURIAN },
  { id: 'bbb-trailer', type: 'trailer', title: 'Big Buck Bunny – Trailer', duration: 33, url: 'https://download.blender.org/peach/trailer/trailer_iphone.m4v', thumbnail: PEACH },
  { id: 'tos-trailer', type: 'trailer', title: 'Tears of Steel – Teaser', duration: 10, url: 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov', thumbnail: MANGO },

  { id: 'popeye', type: 'short', title: 'Popeye for President', duration: 360, url: 'https://archive.org/download/Popeye_forPresident/Popeye_forPresident_512kb.mp4', thumbnail: IA('Popeye_forPresident') },
  { id: 'flower', type: 'short', title: 'Flower', duration: 6, url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4', thumbnail: PEACH },
  { id: 'friday', type: 'short', title: 'Friday', duration: 8, url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4', thumbnail: DURIAN },
  { id: 'jellyfish', type: 'short', title: 'Jellyfish', duration: 10, url: 'https://test-videos.co.uk/vids/jellyfish/mp4/h264/720/Jellyfish_720_10s_5MB.mp4', thumbnail: MANGO },
  { id: 'bbb-clip', type: 'short', title: 'Bunny Clip', duration: 10, url: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4', thumbnail: PEACH },
  { id: 'sintel-clip', type: 'short', title: 'Sintel Clip', duration: 10, url: 'https://test-videos.co.uk/vids/sintel/mp4/h264/360/Sintel_360_10s_1MB.mp4', thumbnail: DURIAN },
];

module.exports = { catalog };
