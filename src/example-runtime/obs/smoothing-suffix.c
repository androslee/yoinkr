YoinkrSmoother *yoinkr_smoother_new(int enabled,int quality,double weight){
 if((enabled!=0&&enabled!=1)||quality<1||quality>100||!isfinite(weight)||weight<3||weight>1000)return NULL;
 YoinkrSmoother *s=calloc(1,sizeof(*s));if(s)s->options=(GimpSmoothingOptions){enabled,quality,weight};return s;
}
int yoinkr_smoother_feed(YoinkrSmoother *s,double x,double y,double velocity,double *out_x,double *out_y){
 if(!s||!out_x||!out_y||!isfinite(x)||!isfinite(y)||fabs(x)>1000000||fabs(y)>1000000||!isfinite(velocity)||velocity<0||velocity>1)return 0;
 GimpPaintCore core={&s->history};GimpPaintOptions options={&s->options};GimpCoords coords={x,y,velocity};
 gimp_paint_core_smooth_coords(&core,&options,&coords);*out_x=coords.x;*out_y=coords.y;return 1;
}
void yoinkr_smoother_reset(YoinkrSmoother *s){if(s)s->history.len=0;}
void yoinkr_smoother_free(YoinkrSmoother *s){free(s);}
