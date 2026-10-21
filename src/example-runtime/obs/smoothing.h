#ifndef YOINKR_GIMP_SMOOTHING_H
#define YOINKR_GIMP_SMOOTHING_H
#ifdef __cplusplus
extern "C" {
#endif
typedef struct YoinkrSmoother YoinkrSmoother;
YoinkrSmoother *yoinkr_smoother_new(int enabled, int quality, double weight);
int yoinkr_smoother_feed(YoinkrSmoother *, double x, double y, double velocity, double *out_x, double *out_y);
void yoinkr_smoother_reset(YoinkrSmoother *);
void yoinkr_smoother_free(YoinkrSmoother *);
#ifdef __cplusplus
}
#endif
#endif
